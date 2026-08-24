# Working in this repo

Read `README.md` first — it has the layout, the ports, and how each half is built and shipped.

## Svelte 5, not Svelte 4

The frontend is Svelte 5 in runes mode (`$state`, `$derived`, `$props`, `$effect`) on SvelteKit 2
with Tailwind CSS 4. Stores, `export let`, `on:click` and `tailwind.config.js` are all gone —
theme tokens live in `@theme` inside `src/app.css`. Check `node_modules/svelte/CHANGELOG.md` or the
docs before reaching for an API you remember.

## The app is a client-side SPA

`ssr` and `prerender` are off for every route (`src/routes/+layout.ts`) because the same bundle
runs inside a Capacitor webview, and everything on screen depends on a Clerk session that only
exists in the browser. Don't add server-side load functions, form actions, or `+server.ts` routes —
the API is Nitro, in `apps/backend`.

## Screens don't fetch, the store does

`src/lib/store.svelte.ts` holds every screen's data for the session, one `Cached` per thing. A
screen calls `ensure()` on mount, which fetches only what's missing or stale, so switching tabs
costs no requests and shows no skeleton. A write calls the matching `invalidate.*()` and refreshes
its own cache; the screens it touched refetch behind their existing rows the next time they're
opened. Don't fetch from a component, and don't instantiate a screen's data class per mount —
they're module-level singletons.

## The calendar is the source of truth, the database is thin

Events live in Google Calendar and are never cached here. `apps/backend/server/lib/calendar/` owns
the whole integration: a `CalendarProvider` interface with one Google implementation, the OAuth
grant in `provider_accounts` (tokens encrypted, see `lib/crypto.ts`), and `event_mappings` saying
what each event counts as. `CalendarEventsService.resolve` is the single read path — the calendar
screen and `/mobile/stats` both go through it, so they can't disagree about a week.

An event carries more than its hours — where it is, how to join it, who else is coming, and when
it wants to remind you — and an invitation can be answered from the app, which writes the reply
back to the calendar everyone else reads. Travel times are separate and never stored:
`server/lib/travel/` asks the Google Routes API on demand, and answers `{ available: false }` when
no `GOOGLE_MAPS_API_KEY` is configured, so every screen has to cope with having no journeys.

Two consequences worth knowing before changing anything here. "Not connected" and "the grant
expired" are states the screens render, returned as 200 with `connected` / `needsReconnect` — never
a 401, which the frontend reads as a dead Clerk session and bounces to sign-in. And every write
must call `eventCache.invalidate(userId)`, or the next read is served a 30-second-old memo.

## Writes go through one queue

`@elumixor/synced` owns every write to the app's own records — categories and activities today.
The rule it exists for is one line: **what a screen shows is the server's records with the writes
it hasn't acknowledged yet replayed on top**, recomputed whenever either half moves. So a pull
landing mid-keystroke can't overwrite the keystroke, and a write the server refuses needs no
rollback — it just stops being replayed.

Screens never fetch or post here either: they call `categories.create/update/delete` (or assign to
a field of `categories.get(id)`) from `src/lib/synced.svelte.ts`, and one loop batches every
model's writes and reads into a single `POST /mobile/sync`. Writes carry a client-made id, so a
retry after a dropped reply is free; `sync_mutations` is what makes that true on the server.

Undo is not a rollback — the server has usually applied the write already — so it's an inverse
write, worked out when the original was made. Group a drag or a burst of keystrokes with
`synced.beginStep()` / `commitStep()`, or `synced.transaction()` in one go.

Adding a model is a `syncedModel` on the server (`server/lib/sync/`) plus a line in
`src/lib/synced.svelte.ts`. Its store is an interface, not a table: `pull`, `read`, `create`,
`update`, `remove`, backed by Drizzle or by somebody else's API. A write whose meaning belongs to
the server — an RSVP, an archive in Gmail — is an `action` instead, with the client saying only
what to draw meanwhile. Calendar events are deliberately not a synced model: Google owns them,
and `CalendarEventsService.resolve` is still the one read path.

## Generated and committed

- `apps/frontend/src/lib/api-client/` is generated from the backend's routes (`bunx nitro-client`).
  Never hand-edit it; regenerate and commit.
- `apps/frontend/src-tauri/` is the macOS shell. It renders the menu bar item, the Dock icon and
  the reminder card, and decides the content of none of them: `src/lib/desktop/` computes each
  state and pushes it down (`update_tray`, `set_dock_icon`, `show_reminder`), with
  `$lib/agenda.svelte.ts` as the one answer to "what is next" that the menu bar and the reminders
  both read. Don't fetch or reason about events in Rust — the session lives in the webview. A new
  command has to be named in `build.rs` and in `capabilities/default.json`, or the built app never
  receives it. `target/` and `gen/` are generated; the rest is committed.
- `apps/frontend/ios/` is a committed Xcode project, and holds everything Apple: `App/WatchApp`,
  `App/WatchWidget`, the `BalanceKit` package they share, and `fastlane/`. The watch app and widget
  targets are added by `ios/wire_watch_targets.rb`, which is idempotent — change the script, re-run
  it, and commit the resulting `project.pbxproj` rather than editing the project by hand.
  Anything both watch targets draw or compute belongs in `BalanceKit` — the ring's geometry
  (`DialLayout`), the hours formatting, the Lucide-to-SF-Symbols map — because the widget runs in
  its own process and a second copy of that maths is a second, quietly different answer. The watch
  reads `/mobile/watch/summary` and writes through `/mobile/tracking/*`; `SessionController` is the
  one place that knows what is running, and the only writer of the App Group snapshot. A calendar file shared into the
  phone app arrives the same native-to-webview way: `IcsImportPlugin.swift` only carries it,
  `$lib/ics.ts` parses it, and the events are written through the ordinary calendar API. A file
  dropped on the Mac app or a browser tab goes to the same sheet through `IcsDropZone.svelte`.

## Reminders are worked out once and shown three ways

`$lib/reminders.ts` answers when a reminder is due — the event's own calendar reminder or the
account's lead time, a second one when it is time to set off, and a fixed one right before a call
starts. Everything else is delivery. The Mac ticks once a minute and asks "is this due now"
(`desktop/reminders.svelte.ts`), because it is running; iOS is asleep by then, so
`mobile/reminders.svelte.ts` works the next two days out ahead of time and hands the whole list to
`UNUserNotificationCenter`, replacing it whenever the calendar or the preferences move.

The wrist is mostly free: a reminder on a locked iPhone is mirrored to the watch, which draws it
with its own scene (`EventNotificationView.swift`) off the colour and glyph travelling in the
notification. `EventAlarm.swift` only covers the case the phone cannot — a watch worn without the
companion app installed — and holds nothing pending otherwise, or the same event would buzz twice.

## Tests

`bun run test` runs the unit tests (`bun run test:coverage` for the report); they live beside what they
cover, as `*.test.ts` under `apps/frontend/src/lib/`. Vitest compiles `.svelte.ts` through the
Svelte plugin, so runes work — see `apps/frontend/vitest.config.ts`.

The suite is not a net cast over the whole app. It covers the modules named in that config's
`coverage.include` list, and covers them completely — 100% of statements, branches, functions and
lines, enforced, so a new branch in one of them fails the run until it's tested. A module joins the
list when its tests actually cover it; padding the list with a screen nobody can test headlessly
would turn a number that means something into one that doesn't.

Write tests that try to break the thing. The ones already here found a DST-day column shift in the
week grid, a "-0m" meter, a URL with the sentence's full stop still on it, dates rolled silently
into the next month, and an invalidation lost by a read that was already in flight.

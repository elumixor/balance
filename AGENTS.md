# Working in this repo

Read `README.md` first — it has the layout, the ports, and how each half is built and shipped.

## Svelte 5, not Svelte 4

The frontend is Svelte 5 in runes mode (`$state`, `$derived`, `$props`, `$effect`) on SvelteKit 2
with Tailwind CSS 4. Stores, `export let`, `on:click` and `tailwind.config.js` are all gone —
theme tokens live in `@theme` inside `src/app.css`. Check `node_modules/svelte/CHANGELOG.md` or the
docs before reaching for an API you remember.

## The app is a client-side SPA

`ssr` and `prerender` are off for every route (`src/routes/+layout.ts`) because the same bundle
runs inside the Mac's Tauri webview, and everything on screen depends on a Clerk session that only
exists in the browser. Don't add server-side load functions, form actions, or `+server.ts` routes —
the API is Nitro, in `apps/backend`.

## A component lives next to the one screen that uses it

`src/lib/components/` holds only what two or more screens draw — buttons, fields, popovers, the
ring. Anything a single route owns sits in that route's `components/` folder
(`routes/(app)/calendar/components/`, `routes/(app)/spheres/components/`), and what only
the app shell draws — the nav, the settings dialog and its panes — is in `routes/(app)/components/`.
Every such folder has an `index.ts`, and a screen imports from the folder, not the file
(`import { WeekGrid } from "./components"`, `import { Button } from "$lib/components"`); siblings in
one folder import each other directly. Logic stays under `$lib/<domain>/` beside its tests.

`$lib` is grouped by what a module is about, not by what kind of file it is. `core/` is the
plumbing every screen stands on — the API client, the caches and the store, the write queue, the
persisted copy, `env.ts`; `platform/` is what the device does around the app — the clock, the
viewport, hotkeys, diagnostics, telemetry, the watchdog; `ui/` is colour, icons, theme and
formatting; `account/` is the session and the account's preferences; `calendar/`, `planning/`,
`practices/`, `travel/`, `integrations/` are the domains, each with its own `types.ts` and its own
`queries.ts` — the only files that name an endpoint. A new module goes into the folder its
subject already lives in; a new folder is a new subject, not a new kind of file.

## Screens don't fetch, the store does

`src/lib/core/store.svelte.ts` holds every screen's data for the session, one `Cached` per thing. A
screen calls `ensure()` on mount, which fetches only what's missing or stale, so switching tabs
costs no requests and shows no skeleton. A write calls the matching `invalidate.*()` and refreshes
its own cache; the screens it touched refetch behind their existing rows the next time they're
opened. Don't fetch from a component, and don't instantiate a screen's data class per mount —
they're module-level singletons.

## The calendar is the source of truth, the database is thin

Events live in Google Calendar and are never cached here. `apps/backend/server/lib/calendar/` owns
the whole integration: a `CalendarProvider` interface with one Google implementation, the OAuth
grant in `provider_accounts` (tokens encrypted, see `calendar/crypto.ts`), and `event_mappings` saying
what each event counts as. `CalendarEventsService.resolve` is the single read path — the calendar
screen and `/mobile/stats` both go through it, so they can't disagree about a week.

An event carries more than its hours — where it is, how to join it, who else is coming, and when
it wants to remind you — and an invitation can be answered from the app, which writes the reply
back to the calendar everyone else reads. Nobody types an address to invite a stranger, so the
guest field is the app's own `PersonField` over the people list (see below), and
`CalendarContactsService` is what fills that list: everyone on the guest lists of the last four
months, which any grant this app has ever made can read, plus the account's own contacts and the
addresses Google keeps from sent mail, which need a scope only a grant made since has
(`google/people.ts`, silent when it is missing). It is one Google pass per ten minutes. Travel times are separate and never stored:
`server/lib/travel/` asks the Google Routes API on demand, and answers `{ available: false }` when
there is nowhere to leave from, so every screen has to cope with having no journeys. The
same key (`GOOGLE_MAPS_API_KEY`) suggests addresses as they are typed (`travel/places.ts`), so a saved place holds the
spelling Maps itself gave back rather than one somebody typed from memory. The suggestions are a
list under the field and never text written into it: `AddressField` is the one address input in
the app, and the map under it reports what it pinned without ever touching what is being typed.
The places somebody has already named in Maps come in as a file, because Google exposes labels and
saved places nowhere else: `$lib/travel/google-places.ts` reads both vintages of the Takeout
GeoJSON (pure, tested), and the sheet it opens ticks nothing by default — a starred list is
hundreds long and four of them are worth naming. Where a journey _starts_
is the event's own answer — a place named in settings, or the device's position, resolved by
`$lib/travel/origin.svelte.ts` and chosen per event on the card. That choice lives on the device,
because "where I am now" only means anything on the machine holding the person. Until a person
chooses, the calendar answers: `$lib/travel/whereabouts.ts` (pure, tested) puts you wherever the last
event with a place left you: its end place when it names one (`endLocation` on its mapping, the
"Ends at" row of the card, a pin in a ring on the block's bottom-left corner), and its location
otherwise — from its end, or from the start of its day when it is all-day. An event with neither
changes nothing. It is read against whatever events
the caller has, the screen's weeks or the agenda's this-week-and-next, and the usual place stands
in before any move. Journeys are asked about for events that have already happened too, with the
server asking for a typical one rather than a bus that has left.

A call is one slot with three answers: Google's own Meet (`conference: "create"`), none
(`"remove"`), or somebody else's by its join link — a Zoom or Teams room written into the event's
`conferenceData` as an `addOn` solution rather than pasted into the notes, so every guest's
calendar draws the same join button for it. Google mints only its own; anything else has to
arrive as a link, which is what the card's "Paste a Zoom or Teams link…" and the MCP `call`
argument both do. Minting a Zoom room is `conference: "zoom"`, which is not something a calendar can be asked for:
`server/lib/zoom/` makes the room first — a per-user OAuth grant in `zoom_connections`, encrypted
with the calendar's own cipher, refresh token rotated on every renewal — and what reaches Google
is the link it answered with. The three `ZOOM_*` keys are the one optional part of `env.ts`,
because they are a feature's switch rather than its settings; without them every screen still
boots and says Zoom isn't set up. Nothing sends anybody to Settings first: the card's Zoom option
asks for the grant at the moment it is pressed (`ensureZoom`), so nobody is sent on an errand first.

An event's description belongs to everyone invited to it — Google puts it in the invitation — so
what one person wants to remember about a meeting has nowhere on the calendar to go. Private
notes are the app's own record instead: `notes` on the mapping, beside `endLocation`, drawn as the
card's last section and open even on an invitation nothing else about can be changed.
`EventMappingService.annotate` is how a write that isn't about what the hour counts as reaches a
block that counts as nothing — it becomes buffer time first, the same rule the card follows.

A grey block files itself when the answer is obvious. Once a week has been drawn the device asks
`POST /mobile/calendar/classify` about it, once a session, and `calendar/classify-service.ts` hands
each event that counts as nothing — a series once for all of it — to Jev (`typesafe-ai/jev`, a
decision model over the AI Gateway, `lib/ai/decision.ts`): spheres as the
options with "none" first, the event's words and shape as the state, and the person's own filings
of similar titles as precedent. A sure answer (`THRESHOLDS` in `classify.ts`, pure and tested)
becomes the same mapping a person's choice would write; every answer, sure or not, is a row in
`event_classifications`, which is what stops a block being asked about twice and what tells an
auto-filed block from a hand-filed one. A series somebody files one occurrence at a time is left
alone, and a model that is down leaves the week grey rather than failing it.

Two consequences worth knowing before changing anything here. "Not connected" and "the grant
expired" are states the screens render, returned as 200 with `connected` / `needsReconnect` — never
a 401, which the frontend reads as a dead Clerk session and bounces to sign-in. And every write
must call `eventCache.invalidate(userId)`, or the next read is served a 30-second-old memo.

An event also says whether it can be changed at all. `readOnly` is the calendar's access role;
`movable` folds in the event's own answer — an invitation is the organizer's to move unless they
set `guestsCanModify`, and Google's own `fromGmail` events take no changes — and is what the drag
handles, the resize bands, delete and the card's fields read. Answering, reminders and the app's
own mapping stay open on an event that can't move, and a 403 `forbiddenForNonOrganizer` from a
stale week comes back as a 409 in words.

## Writes go through one queue

`@elumixor/synced` owns every write to the app's own records — categories and activities today.
The rule it exists for is one line: **what a screen shows is the server's records with the writes
it hasn't acknowledged yet replayed on top**, recomputed whenever either half moves. So a pull
landing mid-keystroke can't overwrite the keystroke, and a write the server refuses needs no
rollback — it just stops being replayed.

Screens never fetch or post here either: they call `categories.create/update/delete` (or assign to
a field of `categories.get(id)`) from `src/lib/core/synced.svelte.ts`, and one loop batches every
model's writes and reads into a single `POST /mobile/sync`. Writes carry a client-made id, so a
retry after a dropped reply is free; `sync_mutations` is what makes that true on the server.

Undo is not a rollback — the server has usually applied the write already — so it's an inverse
write, worked out when the original was made. Group a drag or a burst of keystrokes with
`synced.beginStep()` / `commitStep()`, or `synced.transaction()` in one go.

Adding a model is a `syncedModel` on the server (`server/lib/sync/`) plus a line in
`src/lib/core/synced.svelte.ts`. Its store is an interface, not a table: `pull`, `read`, `create`,
`update`, `remove`, backed by Drizzle or by somebody else's API. A write whose meaning belongs to
the server — an RSVP, an archive in Gmail — is an `action` instead, with the client saying only
what to draw meanwhile. Calendar events are deliberately not a synced model: Google owns them,
and `CalendarEventsService.resolve` is still the one read path.

## A branch decides where the work lands

Work goes on a branch off `develop`, and pushing it deploys nothing. Merging into `develop` builds
the development deployment (`balance-app-dev.vercel.app`, its own Vercel environment with its own
variables) and sends an iOS beta to TestFlight pointed at it; merging into `main` builds
production (`balance-app-mauve.vercel.app`). Every other ref is skipped by `vercel.json`'s
`ignoreCommand`, and a macOS runner is only started once a cheap job has said the app itself
changed.

The Tauri bundle is the one thing a cloud build can't make, so the site doesn't carry it: a Mac
build publishes it to a blob store (`scripts/publish-download.ts`) and `/download/*` is a redirect
into that store (`routes/download/[...path].get.ts`, `DOWNLOAD_BASE_URL`). Deploying the site
leaves the download alone, and a release with a new Mac app in it is still `bun run deploy` from a
laptop.

## Generated and committed

- `apps/frontend/src/lib/api-client/` is generated from the backend's routes (`bunx nitro-client`).
  Never hand-edit it; regenerate and commit.
- `apps/frontend/src-tauri/` is the macOS shell. It renders the menu bar item, the Dock icon and
  the reminder card, and decides the content of none of them: `src/lib/desktop/` computes each
  state and pushes it down (`update_tray`, `set_dock_icon`, `show_reminder`), with
  `$lib/calendar/agenda.svelte.ts` as the one answer to "what is next" that the menu bar and the reminders
  both read. Don't fetch or reason about events in Rust — the session lives in the webview. A new
  command has to be named in `build.rs` and in `capabilities/default.json`, or the built app never
  receives it. The shell is a background agent, not an app somebody opens: `login_item.rs` writes
  a `launchd` job of its own on every launch — `RunAtLoad` plus `KeepAlive` for an exit nobody
  asked for, so a crash comes back and a quit from the tray stays quit — and it is started with
  `--hidden`, so the menu bar and the reminders run without a window. The session it draws from
  survives a relaunch because the Mac holds a device grant in a file (`grant.rs`), the same
  mechanism iOS has in Capacitor Preferences: what clerk-js leaves behind in the webview does not
  survive, which is why a login-item launch used to have nothing to show. The reminder card is a
  non-activating `NSPanel` (`tauri-nspanel`), so a click on it never makes Balance the active app
  — which is what used to bring the hidden main window back and eat the first click.
  `target/` and `gen/` are generated; the rest is committed.
- `apps/frontend/ios/` is a committed Xcode project, and holds everything Apple: `App/WatchApp`,
  `App/WatchWidget`, the `BalanceKit` package they share, and `fastlane/`. The watch app and widget
  targets are added by `ios/wire_watch_targets.rb`, which is idempotent — change the script, re-run
  it, and commit the resulting `project.pbxproj` rather than editing the project by hand.
  Anything both watch targets draw or compute belongs in `BalanceKit` — the ring's geometry
  (`DialLayout`), the hours formatting, the Lucide-to-SF-Symbols map — because the widget runs in
  its own process and a second copy of that maths is a second, quietly different answer. The watch
  reads `/mobile/watch/summary` and writes through `/mobile/tracking/*`; `SessionController` is the
  one place that knows what is running, and the only writer of the App Group snapshot. A wrist is
  out of range often, and that is exactly when a timer matters, so nothing on this screen waits for
  a connection: the last summary is kept in `WatchCache` and drawn before the first request goes
  out, a timer started with no signal runs on the watch alone and is written to the calendar as one
  finished block once there is one (`OfflineWrites.swift`, `POST /mobile/tracking/log`), and a stop
  carries the moment it happened so the hours never grow while the watch is away. A calendar file
  dropped on the Mac app or a browser tab goes through `IcsDropZone.svelte` and `$lib/calendar/ics.ts`;
  the native phone app does not open `.ics` files yet.
- `apps/frontend/ios/App/App/Sources` is the phone app, and `ios/wire_native_app.rb` is what puts
  its files into the `App` target and adds the `AppUITests` target — re-run it after adding or
  moving a Swift file, and commit the `project.pbxproj` it writes. See "The phone app is Swift".

## The phone app is Swift, and a line of text is its form

The iPhone app is native SwiftUI, not the web bundle: the webview drew a desktop calendar on a
phone and never felt like one. It speaks the same API as every other client and holds no rules of
its own about hours — what it adds is how things are made. Everything is typed, the way it is in
puretype: `gym tomorrow 7am 45m #health` is a block on the calendar, and tapping a row turns it
back into its line to be retyped. `BalanceCore` (in `BalanceKit`,
Foundation only, `swift test`) owns that grammar: `LineReader` reads a line into a day, a time, a
length, a sphere or activity (`#`) and a repeat, with the UTF-16 ranges the field highlights;
`LineWriter` writes an event back as the line that would make it, and the tests hold the two to a
round trip. A time makes an event, a day alone an all-day block, and a line with neither makes
nothing. `DayLayout` (lanes for overlapping blocks) and `Sleep` (the Health
night, a port of `integrations/sleep-*.ts` with the same cases) live there too.

The app is three tabs over one `Store` (`Sources/Core/Store.swift`): the list (`Agenda/` —
Today, Tomorrow, This week, Coming up), the calendar (`Calendar/` — a day, three days or a week per page, one vertical scroll so
every page sits at the same hour, blocks held to move and held by their lower edge to stretch, an
empty hour tapped to type a block into it), and Balance (the week's dial from `DialLayout`). An
event's card (`Event/EventSheet.swift`) is a sheet at half height with its name, time, what it
counts as, the Keep page it links to (read-only, its `urn`), place, call, guests, invitation answer, private notes and the Health night;
every change is written as it is made. The sitting (`Session/`) is the review screen and a plan
bar on the calendar that commits the day. Screens never fetch: the store draws a write ahead and
lets the answer correct it, pulls categories and activities through the same
`POST /mobile/sync` the web client uses, fetches events a week at a time, and keeps the last good
copy on disk so a launch opens on a week rather than a spinner. `Backend` is a protocol with the
deployed API behind it and `FixtureBackend` beside it: `-fixtures` launches the app on a made-up
week with no account or network, which is what the `AppUITests` smoke tests drive
(`xcodebuild test -scheme App`), and `TourTests` keeps a screenshot of every screen in the result
bundle (`TEST_RUNNER_BALANCE_TOUR_LIVE=1` runs it read-only on the local backend's real account).

Sign-in is a native Apple or Google sheet whose identity token `/mobile/auth/native/*` trades for a
Clerk ticket, redeemed into a native Clerk session that ClerkKit keeps in the keychain — so the
sign-in screen is seen once. The phone hands the watch its ticket over Watch Connectivity
(`WatchLink.swift`). Which deployment a build talks to is `BalanceAPIBaseURL` in its Info.plist,
written by the release lane from `VITE_API_BASE_URL`.

## The ritual is the product

Nobody opens a time tracker to admire it. `server/lib/planning/` is the loop that makes the rest of
the app worth having: twice a day the phone asks you to look at what happened and to decide what
happens next, and committing that decision is what earns stars.

Four pure modules hold every rule, and they are the only things here with tests
(`cd apps/backend && bun test`): `stars.ts` says what a commit pays and what a total means, `coverage.ts`
says how full a day is and how closely it was kept, `days.ts` turns `YYYY-MM-DD` plus a zone into
instants, and `schedule.ts` says when the next reminders fall. Everything else is a database or a
calendar away from them.

Three decisions are load-bearing. **A planning day is a day in a place** — the device sends
`YYYY-MM-DD` and its IANA zone, because a server doing that arithmetic in UTC is wrong for half the
world after 5pm. **The plan is snapshotted at commit** (`planned_days.blocks`), because the
calendar only ever holds how a day ended up, so "did it go as planned" has no answer otherwise.
And **nothing is settled by a cron**: `PlanningService.settle` charges missed days, pays yesterday's
schedule bonus and last week's balance bonus whenever a session is opened, which is the only moment
anyone can see the result. Every ledger row is unique per day and reason, so running it twice writes
nothing the second time.

Coverage is what unlocks the commit button, and only _mapped_ hours count toward it — a calendar
full of meetings other people booked is not a planned day, and deciding what those meetings are for
is the work. A day is measured against the whole of itself and the bar is 70% for everyone
(`COVERAGE_THRESHOLD`) — both were settings once, and both only ever asked people to choose the
number they would rather not fail.

## The words arrive before the phone wakes up

`server/lib/planning/copy.ts` writes what a session says, once per slot per day, into `session_copy`.
It has to be written ahead: the phone is asleep at six in the evening, so the notification's text is
handed to `UNUserNotificationCenter` hours early (the phone's `Reminders.swift`), and the
screen that opens when it is tapped reads the same stored row rather than asking for a fresh
sentence that would contradict the banner.

Copy is only generated for real once a slot is close (`isFresh`) — an evening's summary composed at
breakfast would describe a day that has not happened — and until then the arithmetic `fallback` is
scheduled instead. That fallback is a real answer, not an error message: a model that is down can
never cost someone their reminder.

The voice is a rule, not a preference: write from the far side of the thing, how it will feel to
have already done it, and never name a failure, a miss or a broken streak. Reviews are payouts.

## The week grid is a shell around parts that each own one thing

`calendar/components/WeekGrid.svelte` derives the strip and composes; it draws nothing itself.
`week-scroll.svelte.ts` is the only writer of `scrollLeft` — the jump, settle and land state
machine, with a `destroy()` the shell calls so no frame outlives the grid. `ZoneGutter`, `AllDayRow`,
`DayColumn`, `TravelBand`, `DragGhost`, `NowLine` and `TodayButton` each take what they draw as
props. The arithmetic behind them — placing segments, the marquee box, the travel band's geometry —
is in `$lib/calendar/week-grid.ts`, pure and at 100% coverage, because a DST-day column shift was
found there once and nothing in a component can be tested for that.

The data behind the grid is the same split. `$lib/calendar/calendar-data.svelte.ts` is the façade
every component talks to: the window and navigation, the derived lists, and a delegating member for
each operation. Behind it `writes.svelte.ts` is the draw-ahead queue (what a screen shows is the
server's week with the writes it hasn't acknowledged yet replayed on top), `edits.svelte.ts` is
every operation a person does recorded as a history step with its inverse, `drag.svelte.ts` is
the pointer state machine, `selection.svelte.ts` and `series.svelte.ts` are what their names say,
and `purpose.ts` and `geometry.ts` are pure and tested.

## Planning is the calendar, not a screen

`?plan=YYYY-MM-DD` on `/calendar` lights one day, dims the rest, and puts `PlanningBar` as a strip above the grid. Everything
that makes the calendar good — dragging a block in from tomorrow, seeing what sits either side — is
the point, and the parameter rather than a flag is what survives a reload. `planMode` works coverage
out on the device so the meter answers a drag immediately; the server checks it again on commit,
because that is where the star is actually earned.

## The event card is sections, and the calendar keeps most of them

`calendar/components/EventEditor.svelte` is one card: sphere and name, what it is for, when, how you'll be
told, where and with whom, what it says — each a section component beside it (`EditorHeader`,
`TimeSection`, `RemindersSection`, `MeetingSection`, `DescriptionSection`, `EditorFooter`), with
the typed-and-saved state in `$lib/calendar/event-draft.svelte.ts`, which is what makes the
debounce and the carried-over-id rule testable. What the hour counts as and what it was for are
one question with one list (`filingItems`: each sphere with its practices under it), opened from
the badge or by a `/` typed into the name (`$lib/calendar/slash.ts`, pure and tested), where
Escape closes the list and not the card. Every write a section makes goes through
`draft.write(title, promise)`, so a refused one reaches the screen. Everything the meeting carries — a place, its time zone,
how it repeats, its reminders, its guests, its call — is written straight back to Google through
one `PATCH /calendar/events/:id` and `calendarData.patchEvent`, which draws the answer ahead and
takes an inverse patch for undo. A rule always lands on the series' master, the only event that
has one, so the card fetches the master once per series to read it; anything else edited on an
occurrence is offered to the rest of the series the way a retitle is — every occurrence, or "from
here on", which the server answers by ending the master's rule just before the occurrence and
starting a new series where it stands (`calendar/series-split.ts`, pure and tested). A delete asks
the same three ways first, since a series is the one thing the app can't put back. Who hosts it is
the organizer's name on the guest list, which is a picker of every connected account's calendars
(`OrganizerPicker`): choosing one hands the event over — one call inside an account, keeping its id
and its guests' answers, and written again on the far side and deleted on the near one between two,
because neither account can write the other's calendar. A repeating event moves as its master. The translations are pure
and tested: `calendar/recurrence.ts` speaks RRULE, `reminder-lead.ts` reads "45m" and "at time",
and `time-zones.ts` names zones by city, works out "GMT+2" on the day, and moves an instant
between zones keeping its wall clock. Zones a person names — "Kyiv", "the office" — and the card
sections they have folded away both live on the account (`preferences.zones`, `preferences.card`),
so they are the same on every device. `ComboField` is the one typed-and-picked field under the
zone, repeat and reminder pickers. The assistant's button is a seat at the table and nothing more
yet.

## Reminders are worked out once and shown three ways

`$lib/calendar/reminders.ts` answers when a reminder is due — the event's own calendar reminder or the
account's lead time, a second one when it is time to set off, and a fixed one right before a call
starts. Everything else is delivery. The Mac ticks once a minute and asks "is this due now"
(`desktop/reminders.svelte.ts`), because it is running; iOS is asleep by then, so the phone's
`Reminders.swift` works the next two days out ahead of time and hands the whole list to
`UNUserNotificationCenter`, replacing it whenever the calendar or the preferences move — the same
rule, without the time-to-set-off reminder, which needs a journey the phone does not ask for yet.

The wrist is mostly free: a reminder on a locked iPhone is mirrored to the watch, which draws it
with its own scene (`EventNotificationView.swift`) off the colour and glyph travelling in the
notification. `EventAlarm.swift` only covers the case the phone cannot — a watch worn without the
companion app installed — and holds nothing pending otherwise, or the same event would buzz twice.

## A failure has to reach the screen

Three things kept a broken app looking like a loading one, and all three are now closed.

`$lib/platform/diagnostics.svelte.ts` holds every failure the app knows about, and `ProblemToasts` is the
only thing that draws one: a pile in the top-right corner, one card per failure, wherever it came
from. Screens used to say it themselves — a card here, a red line there — which is how a card meant
for a sentence ended up holding a database query and covering the week it was about. So a card is
a title written for a person and nothing else; what actually broke is behind the copy button,
because a webview on a phone has no console anybody can open. A failure that something knows how to
undo carries a `retry`, and the card grows a refresh: a `Cached` hands over its own refetch, the
render boundary hands over `reset`. Repeats are separate cards, leaning into the pile rather than a
count. The pile itself is `svelte-sonner` — the heights, the animation, expand-on-hover and
swipe-to-dismiss are solved and not worth rewriting — with `diagnostics` as the truth behind it, so
dismissing by hand, by retry or by swipe all end in the same place.

A screen that throws while rendering is caught by the `<svelte:boundary>` in the app layout, so the
shell around it — the tabs, the rail — stays alive and answers. Before that, one screen's error
took every effect in the app with it, which reads as a tab bar that has stopped working.

A screen is not the only place a failure has to reach. `$lib/platform/telemetry.ts` hangs off
`diagnostics.report`, so every failure the app already knows how to say is also sent to Sentry, with
what the person was doing before it sent to PostHog — one call, because a second thing to remember
is a thing that gets forgotten. The API reports the same way (`server/lib/telemetry.ts`, wired into
`server/error.ts`, and an `ApiError` is an answer rather than a crash), and the two Apple targets
that are not a webview report through `BalanceTelemetry` — the phone app, whose failures are also
the cards of its `ProblemBanner`, and the watch, which has no console and no room for an error card. The
client keys are public by design and live in one place (`VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`),
which the release lane writes into the iOS and watchOS `Info.plist`s so all four platforms report
to one project.

## An assistant is another client, and it gets the services, not the API

`server/lib/mcp/` is the Model Context Protocol, spoken at `/mcp`: `tools.ts` is what an assistant
can do, `protocol.ts` is the JSON-RPC that carries it, `authenticate.ts` is whose account it is
about. The protocol is written out rather than pulled in — a stateless server of tools is one
`switch`, where the official SDK brings a transport built around Node's `req`/`res` and a zod of
its own, neither of which survives being a Vercel function.

Three rules hold it together. **A tool calls a service, never the HTTP API** — an MCP call is
already inside the process, and going out through `fetch` would be a second copy of auth and a
second set of DTOs; a tool's answer is deliberately smaller than the screen's, because a week of
full events is thousands of tokens of fields nobody asked about. **A failed tool is a result, not
an error**: an `ApiError` — "reconnect your calendar" — comes back as `isError` with its sentence,
and only a malformed request is a JSON-RPC error. And **stateless is the deployment's doing**: two
calls are two processes, so there is no session id, `GET` and `DELETE` answer 405, and the key on
each request is the whole of what the server knows.

That key is an `mcp_tokens` row (`lib/mcp/tokens.ts`), minted in Settings → Assistants, shown
once, stored as a hash, and never rotated — the holder has nowhere to write a replacement. Anything
that isn't one of ours is handed to the ordinary session check, which is what makes `DEV_AUTH_EMAIL`
cover this endpoint too. Two lines of configuration exist only for these routes and are easy to
miss: `/mcp` is in `nitro-client.config.ts`'s `excludeRoutes` (by path, so `/mobile/mcp/keys` stays
typed), and `mcp` and `.well-known` are in the root `package.json`'s `apiPrefixes`, without which a
production deployment answers them with the app shell and a 200.

A key made by hand can't reach a chat client that is only given a URL, so `lib/mcp/oauth.ts` is an
authorization server as well: RFC 9728 metadata under `routes/.well-known/` says where it is, RFC
7591 registration lets a client name itself, and `/authorize` — a page in the app, not a route
here — is where a person says yes. It is small on purpose: authorization code only, public clients
only, PKCE required rather than negotiated, refresh tokens rotated, and one scope, because a key is
the whole account and the consent screen says exactly that. What it issues is an ordinary
`mcp_tokens` row, so `/mcp` has one idea of a caller and the settings list has one row to revoke —
and revoking a row that names a client takes that client's refresh tokens with it, or the connector
would mint itself another the moment the key stopped working.

## A route is a signature, a service is the work

`server/lib/` is one folder per subject — `auth`, `categories`, `calendar`, `planning`, `practices`,
`preferences`, `tracking`, `travel`, `stats`, `sync`, `watch` — and `db/schema/` is split the same
way, re-exported from its `index.ts`. Every import is `~/lib/...`, never a relative climb. A route
under `routes/mobile/**` is `authed(schemas, fn)` from `lib/http/authed.ts`: the schemas, the user
already resolved, the service call, the DTO — and nothing else. No route catches: `server/error.ts`
is the one place an error becomes a response. An `ApiError` (`lib/http/api-error.ts`, with the
typed 401/404/409/502 subclasses) is an answer and goes out as its status with `{ error }`; a zod
refusal goes out as 400 naming the field; anything else is reported to Sentry and answered as a
500 that says nothing about what broke. The typed client is generated from those signatures, so a
route's return type is its contract — the `{ error }` union that every caller used to unwrap is
gone with the catches.

## Configuration is required, never defaulted

`server/lib/env.ts` is the only place the API reads its environment: one zod schema, every key
required, parsed once at start-up by `server/plugins/env.ts`, so a deployment missing a key
refuses to boot and names what it lacks rather than answering wrongly hours later. The frontend
does the same at build time: `vite.config.ts` refuses to build without the public keys it bakes
in. Read `env.X`, never `process.env.X`; add a key to the schema, never a `?? fallback`. The one
optional key is `DEV_AUTH_EMAIL`, which is a switch, not a setting. The frontend's half is
`$lib/core/env.ts`: the only file that reads `import.meta.env`, so a key the bundle carries is
named once and every public identifier — Clerk, Sentry, PostHog, the OAuth clients — is read from
there.

Last of all, `$lib/platform/watchdog.svelte.ts` watches the thing none of that can watch: Svelte flushes
every effect in one pass, so one effect that re-triggers itself doesn't fail alone — the scheduler
gives up and takes the whole tree with it, leaving a calendar that still scrolls and a tab bar that
has stopped answering. A timer outside the reactive system bumps a counter, an `$effect` stamps the
time, and when the stamp stops moving while the timer keeps firing the card that says so is built
from plain DOM nodes, because every other way of putting something on screen has just been proved
unable.

And an API address that isn't the API is now said out loud. A native shell serves its bundle from
`https://localhost`, so a relative base points every request at the app itself, which answers with
`index.html` and a 200 — data-shaped nothing that used to be parsed as a week. `vite.config.ts`
gives a native build the deployed address when nothing else says otherwise, and `core/env.ts`
refuses to make requests at all when the address it has can't be one.

## People are one list, and every field that names one is the same field

`people` is the account's own list of everyone it knows — a name, an address, a colour and a
face — and the rows are synced records like a category. Nobody types the list in: on every
launch `POST /mobile/people/seed` reads the guest lists of the last four months of events
(`server/lib/people/service.ts`, over `CalendarContactsService`) and adds a row for anyone met who
isn't there, named the way the address book spells them or read off the address
(`name.ts`, tested), with the address book's picture or a Gravatar where either exists. The
address book itself is not seeded — a thousand "other contacts" would bury the twenty who
matter — but it is what a name and a face are looked up in (`/mobile/people/lookup`, the wand
in settings).

On the device `$lib/people/directory.svelte.ts` is the one way in: `ensure(typed)` finds the row
for an address or a name and makes one otherwise, so a stranger invited from the event card is
offered on the next event. `PersonField` is the only component that names a person — the guest
field — and `suggest.ts` (pure, tested) is its ranking:
the start of a word of the name or of the address first, whoever is already on the list left out.
A face is `Avatar` everywhere it is drawn, initials on a colour until there is a picture, and an
uploaded one is shrunk to a 128px JPEG data URL on the device (`avatar.ts`) so it travels as a
record rather than a file. Settings → People is where a name is corrected, a picture dropped on a
face, and a person the calendar never met is added.

## ⌘K finds anything

`$lib/search/` is the palette: `items.ts` (pure, tested) ranks rows of one shape from every
source — the screens, the settings sections, the people — and
`palette.svelte.ts` builds them from what the device already holds, so every keystroke answers
at once. Only the calendar is asked, after a pause and from two letters on:
`GET /mobile/calendar/search` is Google's own full-text search over the visible calendars
(`CalendarSearchService`, a year either way, a dozen hits nearest today first), returning rows to
jump to rather than resolved events. A hit opens as `/calendar?event=<id>&at=<instant>`, which
`calendarData.openEvent` turns into the week and the card beside its block. `isSearchKey` is ⌘K everywhere, a text field included; the strip has a
button and the phone's menu a row for the same box.

## Projects and tasks live in Keep; a block only points at one

Balance has no projects, stages or tasks of its own any more: they are Keep's
(`keep.atmagaming.com`), and Keep never knows Balance. What an hour was for is the `urn` on its
`event_mappings` row — `keep:page/<id>` names a Keep task — validated only as a URN
(`urnField` in `lib/http/schemas.ts`) and never read. It is written by the block routes
(`POST /mobile/calendar/events`, `POST /mobile/calendar/mappings`) and the MCP tools
(`create_event`, `update_event`, `categorize_event`), and drawn by the card as a small link
(`$lib/calendar/urn.ts` turns a `keep:page` URN into Keep's embed URL off `KEEP_ORIGIN` in
`$lib/core/env.ts`; any other URN is shown as text). No Keep code is imported anywhere.

A sphere is a category on the ring, and `/spheres` is its screen: the ring on one side is the
picture of the list on the other, where each sphere is named, sized in hours and percent, and holds
its practices. A seam dragged on the ring and a number typed in a sphere's heading move the same
hours (`$lib/planning/category-drafts.svelte.ts`), and a sphere's menu — split, remove — is the same
from a slice and from its heading. Practices are synced records: something recurring, measured by
adherence over the last four whole weeks. `PracticeProgressService` (`server/lib/practices/`,
`GET /mobile/practices/progress`) reads the calendar through the same
`CalendarEventsService.resolve` as everything else and counts blocks whose mapping carries the
`practiceId`. Blocks that overlap share the time: wherever several run at once each gets an equal
part of it (`server/lib/stats/overlap.ts`, tested), so the ring, the planning hours and a
practice's count never count one hour twice.

## Integrations hang off the events that planned them

`src/lib/integrations/` is what knows how some hours actually went — Apple Health today, its one
feed being sleep. A feed is linked to an event from the event's own card ("Integrations…" row):
the link is the mapping's `source` (`"apple-health:sleep"`), so a series link covers every
occurrence and survives the way a category does, and a block that counted as nothing is first
made to count as the category named for the feed, or the buffer. A one-off block is made a daily
series first, so the link covers every night. The block then follows the record: a sync that finds
the night began or ended elsewhere moves the occurrence to it, so the calendar ends up holding what
happened and the record explains it.

Reading a source happens on the device that can — Health only on the iPhone — and only after the
person has let it (`integrations.connect`, kept in `persist.readSetting`, never aged out). On
launch and on resume, at most every four hours, each readable feed looks up its linked
occurrences from the last two weeks, asks the feed for a record per occurrence
(the phone's `HealthSync.swift` reads the samples, and `BalanceCore`'s `Sleep` — a port of
`sleep-sessions.ts`, `sleep-summary.ts` and `sleep-score.ts`, with their tests — turns them into
the night) and writes them with
`POST /mobile/integrations/records`. `integration_records` is keyed by occurrence; `resolve`
hangs each record on its event, but only under the feed the mapping still names, so unlinking
orphans the records rather than showing them. The card draws the feed's own `section`
(`SleepSection.svelte`) from `event.record` on every platform. A new integration is one more entry
in `INTEGRATIONS` — feeds with a `record` reader and a section — and whatever native or OAuth
code reads it; the server never learns its name or the record's shape.

## Signing in is skippable in development

A simulator asking for a Google consent screen on every clean install is a minute of clicking
before anything can be looked at. `DEV_AUTH_EMAIL` in `.env` makes every backend request that
account — the real Clerk user, the real calendar — and `VITE_DEV_AUTH=1` makes the app skip its
sign-in to match. Both halves are fenced: `vite.config.ts` only defines the flag for a development
build, and the backend ignores its half in production and on Vercel.

The watch has the same bypass one level down (`BalanceKit/DevAuth.swift`): `bunx devkit dev:iwatch`
launches it with `BALANCE_DEV_AUTH=1`, which points `APIClient` at `http://localhost:3100` and
sends requests without a Clerk session, so a watch on a simulator with no paired phone shows the
real week rather than the "open Balance on your phone" card. `bunx devkit dev:iphone` launches the
phone app the same way. `--real` launches either without the flag.

## Tests

`bun run test` runs both suites. The frontend's are Vitest, beside what they cover as `*.test.ts`
under `apps/frontend/src/lib/` (`bun --filter frontend test:coverage` for the report); the backend's
are `bun test`, and cover `server/lib/planning/`'s pure rules — the star arithmetic, the coverage
and match formulas, zoned days, and the reminder schedule. Vitest compiles `.svelte.ts` through the
Svelte plugin, so runes work — see `apps/frontend/vitest.config.ts`.

The suite is not a net cast over the whole app. It covers the modules named in that config's
`coverage.include` list, and covers them completely — 100% of statements, branches, functions and
lines, enforced, so a new branch in one of them fails the run until it's tested. A module joins the
list when its tests actually cover it; padding the list with a screen nobody can test headlessly
would turn a number that means something into one that doesn't.

Write tests that try to break the thing. The ones already here found a DST-day column shift in the
week grid, a "-0m" meter, a URL with the sentence's full stop still on it, dates rolled silently
into the next month, and an invalidation lost by a read that was already in flight.

## What a build leaves behind is swept, not accumulated

Four native toolchains write here, and none of them ever deletes anything: Xcode's derived data
for the phone and the watch, SourceKit-LSP's index build of `BalanceKit`, cargo's `target/`, and a
simulator that keeps every byte the app ever wrote to it. Unattended that reached 40 GB, so
`scripts/space.ts` says what is there (`bun run space`) and takes back what is stale
(`bun run space:clean`), and `bun run space:agent` installs the weekly launchd job that runs the
second one. Nothing touched in the last 14 days is removed, the simulators in use are never erased,
and the three newest archive days stay — a dSYM is the only way to read a crash out of a shipped
build, and nothing uploads them anywhere else.

The one structural fix is `scripts/spm-cache.ts`, run on `bun install`: the two derived data dirs
resolve the same package graph, and Sentry's prebuilt XCFramework alone makes each copy ~4 GB, so
their `SourcePackages` are symlinks to one shared directory — what
`xcodebuild -clonedSourcePackagesDirPath` would do if devkit had a way to pass it.

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

## A component lives next to the one screen that uses it

`src/lib/components/` holds only what two or more screens draw — buttons, fields, popovers, the
ring. Anything a single route owns sits in that route's `components/` folder
(`routes/(app)/calendar/components/`, `routes/(app)/projects/[id]/components/`), and what only
the app shell draws — the nav, the settings dialog and its panes — is in `routes/(app)/components/`.
Every such folder has an `index.ts`, and a screen imports from the folder, not the file
(`import { WeekGrid } from "./components"`, `import { Button } from "$lib/components"`); siblings in
one folder import each other directly. Logic stays under `$lib/<domain>/` beside its tests.

`$lib` is grouped by what a module is about, not by what kind of file it is. `core/` is the
plumbing every screen stands on — the API client, the caches and the store, the write queue, the
persisted copy, `env.ts`; `platform/` is what the device does around the app — the clock, the
viewport, hotkeys, diagnostics, telemetry, the watchdog; `ui/` is colour, icons, theme and
formatting; `account/` is the session and the account's preferences; `calendar/`, `planning/`,
`projects/`, `travel/`, `integrations/` are the domains, each with its own `types.ts` and its own
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
back to the calendar everyone else reads. Travel times are separate and never stored:
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
  survive, which is why a login-item launch used to have nothing to show. The reminder card can't
  become the key window, which is what keeps a dismiss from bringing the hidden main window back.
  `target/` and `gen/` are generated; the rest is committed.
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
  `$lib/calendar/ics.ts` parses it, and the events are written through the ordinary calendar API. A file
  dropped on the Mac app or a browser tab goes to the same sheet through `IcsDropZone.svelte`.

## The ritual is the product

Nobody opens a time tracker to admire it. `server/lib/planning/` is the loop that makes the rest of
the app worth having: twice a day the phone asks you to look at what happened and to decide what
happens next, and committing that decision is what earns stars.

Four pure modules hold every rule, and they are the only things here with tests
(`cd apps/backend && bun test`, alongside the Notion translations): `stars.ts` says what a commit pays and what a total means, `coverage.ts`
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
handed to `UNUserNotificationCenter` hours early (`mobile/session-reminders.svelte.ts`), and the
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
debounce and the carried-over-id rule testable. Every write a section makes goes through
`draft.write(title, promise)`, so a refused one reaches the screen. Everything the meeting carries — a place, its time zone,
how it repeats, its reminders, its guests, its call — is written straight back to Google through
one `PATCH /calendar/events/:id` and `calendarData.patchEvent`, which draws the answer ahead and
takes an inverse patch for undo. A rule always lands on the series' master, the only event that
has one, so the card fetches the master once per series to read it; anything else edited on an
occurrence is offered to the rest of the series the way a retitle is — every occurrence, or "from
here on", which the server answers by ending the master's rule just before the occurrence and
starting a new series where it stands (`calendar/series-split.ts`, pure and tested). A delete asks
the same three ways first, since a series is the one thing the app can't put back. The translations are pure
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
(`desktop/reminders.svelte.ts`), because it is running; iOS is asleep by then, so
`mobile/reminders.svelte.ts` works the next two days out ahead of time and hands the whole list to
`UNUserNotificationCenter`, replacing it whenever the calendar or the preferences move.

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
that are not a webview report through `BalanceTelemetry` — the phone's Swift shell, which runs
before there is a webview, and the watch, which has no console and no room for an error card. The
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

`server/lib/` is one folder per subject — `auth`, `categories`, `calendar`, `planning`, `projects`,
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

## Projects are the layer between a sphere's hours and Tuesday 9:00

A sphere is a category on the ring; `server/lib/projects/` and `src/lib/projects/` are what those
hours are _for_. A project is work with a name under a sphere, and it can hold other work: nesting
is the whole shape of it — "ATMA / Hypocrisy / Combat" is three rows with a `parentId` each, and
every level is a project with the same fields, so there is no second kind of thing for the level
above or below. A child carries its parent's sphere, because hours have to land on the ring
somewhere. Everything but a name and a sphere is optional, and a project has to be creatable in ten
seconds.

Under a project: **stages**, which are bands across its timeline and hold no work of their own, and
**tasks**, which nest the same way projects do. A task carries its days, who it is for, what board
column it sits in and how big it is thought to be. A parent's dates are its own when it has them
and its children's span otherwise (`gantt.ts`), so a plan can be written from the top down or from
the bottom up. What a project says about itself beyond that — "Start Date", "Estimated Duration",
"Dashboard" — is a list of fields it carries, and the app has no opinion about which fields those
are. Practices are the exception that never becomes a project: something recurring, measured by
adherence over the last four whole weeks.

Projects, people, stages and tasks are all synced models (`server/lib/sync/`, one `TableStore`
each) and live in `src/lib/core/synced.svelte.ts`, so a row is written the way a category is. The
three pure modules are tested to 100%: `tree.ts` (nesting, breadcrumbs, and what to do about a
cycle), `gantt.ts` (spans, the window, bars and columns) and `rollup.ts` (a stage's progress,
counted on the leaves, because a parent is a heading over its subtasks). The screens are three ways
to read the same tasks — a timeline, an outline and a board — and the address holds which one, so a
reload keeps it.

Hours are still the point. `ProjectProgressService` reads the calendar through the same
`CalendarEventsService.resolve` as everything else and counts blocks whose mapping carries a
`projectId` — the same `event_mappings` row that says what an hour counts as also says what it was
for — and answers twice for a project holding others: what was booked against it by name, and what
its whole tree came to. Tagging a grey block to a project after the fact is how a real week is
reconciled, so it is on the block's card and its context menu. Filling the week is a solver
(`calendar/filler.ts`): remaining claims into free working hours, biggest claim first, shown as a
diff of blocks to accept or trim.

The model's two moments are `server/lib/projects/assist/` (schemas, prompts, both over one
`lib/ai/gateway.ts`) and the `projects/assist/*` routes, and both are proposals: a note over the
week's fill about what to drop, and a calendar block worked out into a project, a task, steps and a
length (the route exists; the card's assistant button does not call it yet). Neither writes a
record, and a model that answers nothing leaves every screen as it was.

## Notion is mirrored, and the rule about who wins is one line

`server/lib/notion/` mirrors a Notion workspace into that layer: one database of projects and,
under each project's own page, the database its tasks live in — found by walking down from the page
and taking the first one whose name says tasks (`discover.ts`), then remembered on the project.
The protocol is written out rather than pulled in, the same way `lib/mcp/` is: `client.ts` is eight
requests against one API version, and `map.ts` and `data-source.ts` are the pure translations (both
tested with `bun test`) — a property into a field, a column into a status, whatever a board calls
"Ready For Test" into one of the five the app counts by.

**Notion owns everything it is shown**: a project's name, its description, its fields, which tasks
exist and what they are called. The app owns the three things a person changes while doing the work
rather than while planning it — a task's status, its dates, and who it is for — and those go up
first, so a pull can never overwrite a tap made a second ago. A page that has gone archives its row
here rather than leaving a bar nothing will move.

The grant is an integration token somebody pasted, encrypted with the same `calendar/crypto.ts` a
refresh token is. "Not connected" and "the token stopped working" are states the settings row
draws, returned as 200 with `connected` / `needsReconnect` — never a 401, which the frontend reads
as a dead Clerk session. The projects screen asks for a run when it opens, at most every five
minutes, and its failure is a card in the corner: what was pulled last time is still on the device.

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
(`HealthKitPlugin.swift` hands raw samples up and decides nothing; `sleep-sessions.ts` and
`sleep-summary.ts` turn them into the night, and are tested) and writes them with
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
real week rather than the "open Balance on your phone" card. `--real` launches it without the flag.

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

# Balance

A time-balance tracker: decide how the 168 hours in your week should be spent, then let your own
calendar say what actually happened, and see the drift.

Twice a day it asks you to sit with that for two minutes — how the day went, and what tomorrow is
for — and planning tomorrow earns stars, which is the only reason anyone keeps doing anything.

Google Calendar is the source of truth for events — nothing about them is stored here. What this
app adds is meaning: each event is mapped to an *activity* (a template that splits one hour across
several categories), or, as an exception, straight to categories. Drag an activity onto the week
and it becomes a real event in your calendar.

On top of the ring sits a projects layer: each sphere's hours are claimed by projects — bounded
work with a gate per stage and a decision date derived from the budget — or kept by practices that
never complete. The calendar is the evidence: a block tagged to a project counts toward its gate
and against its claim.

## Layout

| Path                  | What it is                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `apps/frontend`       | SvelteKit app (static SPA), shipped to iOS inside a Capacitor webview  |
| `apps/frontend/ios`   | Everything Apple: the committed Xcode project, BalanceKit, fastlane    |
| `apps/frontend/src-tauri` | The macOS shell: the menu bar item and the window around the SPA  |
| `apps/backend`        | Nitro JSON API over Postgres (Neon) with Drizzle                       |
| `@elumixor/synced`     | The optimistic write queue both halves speak — records, retries, undo  |

Auth is Clerk on both sides; the frontend sends its session token to `/mobile/*`.

## Running it

```bash
bun install
bun run dev          # every platform at once
bunx devkit dev:web  # only the web stack — the backend and the SPA
```

The product ships on four platforms, and devkit names them the same way everywhere: `web`, `mac`,
`iphone`, `iwatch`. `devkit dev:<platform>` runs one of them, and starts whatever it needs — the
three native shells all point at the web dev server, so naming any of them brings that up too.
What each one runs lives in the `devkit.dev` block of the root `package.json`.

That's `backend` on `http://localhost:3100` and `frontend` on `http://localhost:8081`. To run just
one process: `cd apps/backend && bun run dev`, or `cd apps/frontend && bun run dev`.

Both apps read the one `.env` at the root (symlinked into each). Every key is required, and a
missing one stops the backend at start-up and the frontend at build time with its name — see
`apps/backend/server/lib/env.ts` for the full list. The backend needs `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET` (the last two are
`openssl rand -base64 32`), `GOOGLE_MAPS_API_KEY` for travel times through the Google Routes API
and address suggestions through the Places API, `AI_GATEWAY_API_KEY` for the session copy and the
project proposals, `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST` for its own failures, and `APPLE_BUNDLE_ID` and
`GOOGLE_IOS_CLIENT_ID`, which say who a native sign-in token has to be addressed to. The
frontend needs `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`,
`VITE_POSTHOG_HOST` and `VITE_API_BASE_URL`. With
no `VITE_API_BASE_URL`, dev falls back to this machine's LAN address (so a phone on the same
network reaches the backend), a web release build falls back to the empty string, which is what
makes the deployed web app talk to its own origin, and a build for one of the native shells falls
back to the deployed address — those carry their own copy of the bundle and serve it from
`https://localhost`, where an empty base would point every request at the app itself.

Two more are development-only and off by default in a release however they are set:
`DEV_AUTH_EMAIL` makes every backend request that account instead of authenticating one, and
`VITE_DEV_AUTH=1` makes the app skip its sign-in screen to match. Together they are a simulator
that opens on real data with nothing to click. The watch app has the same bypass:
`bunx devkit dev:iwatch` launches it with `BALANCE_DEV_AUTH=1` (add `--real` to launch without),
which points it at `http://localhost:3100` and needs no paired phone.

### The database

Drizzle owns the schema (`apps/backend/server/db/schema.ts`) and `server/db/migrations/` is
generated from it: `cd apps/backend && bun run db:generate` after changing a table, then
`bun run db:migrate` to apply it. `bun run db:studio` opens a browser over the data.

Migrations arrived after the deployed database did — it was built with `drizzle-kit push`, so it
already has every table the baseline migration creates and `db:migrate` would fail on the first
`CREATE TABLE`. An existing database has to be baselined once: apply anything new with
`bunx drizzle-kit push`, then insert the baseline's hash into `drizzle.__drizzle_migrations` so it
counts as applied. A database created from scratch needs none of this — `db:migrate` builds it.

### Connecting Google Calendar

The OAuth client is a **web** client (the iOS sign-in client has no secret and can't do a
server-side code exchange), with `calendar.events` and `calendar.calendarlist.readonly` — both
sensitive scopes, so the consent screen needs verification before anyone but a listed test user
can use it. Redirect URI is `<origin>/mobile/integrations/google/callback`; Google only allows
`http` on `localhost`, so connect against `localhost:3100` in dev rather than the LAN address.

While the consent screen is in testing Google expires refresh tokens after seven days. That is a
state the app renders rather than an error: the token store is marked revoked and every endpoint
answers 200 with `needsReconnect: true`.

The frontend's typed API client (`apps/frontend/src/lib/api-client`) is generated from the
backend's route handlers — run `cd apps/backend && bunx nitro-client` after changing a
`server/routes/mobile/**` handler's schema or response shape, and commit the regenerated output.

## Deploying the web app + API

```bash
bun run build  # SvelteKit static build -> apps/backend/public, then Nitro's Vercel build output
```

Both halves ship as one Vercel deployment at
[balance-app-mauve.vercel.app](https://balance-app-mauve.vercel.app): the static SPA for the app,
one function for `/mobile/*` and `/health`. Any path that isn't an API prefix answers with the app
shell, and the client router takes it from there. `bun run deploy` ships it (see "Releasing");
pushing to `main` does not — `vercel.json` turns Vercel's git deployments off, so a release is
something you trigger, not something a push causes.

## iOS

```bash
bunx devkit dev:iphone    # simulator, loading the dev server — web edits are live, native ones rebuild
bunx devkit dev:iwatch    # the watch app on its own simulator, signed in as DEV_AUTH_EMAIL (--real to pair)
bunx devkit build:iphone  # web bundle -> Xcode project -> compiles the app, no signing
cd apps/frontend && bun run assets  # regenerates icons + splash screens from assets/icon.png
```

Neither dev command opens Xcode: the app is built, installed on the simulator and launched, and
then the native sources are watched — saving one rebuilds and relaunches, which is the whole loop.
`--device` picks a different simulator than the configured one.

Everything Apple lives under `apps/frontend/ios`: the committed Xcode project (`App/`), the watch
app and widget sources (`App/WatchApp`, `App/WatchWidget`), the BalanceKit Swift package they
share, and the fastlane lane. Capacitor only knows about the single iOS target, so the watch app
and widget are wired in by `ios/wire_watch_targets.rb` — re-run it (it is idempotent) if Capacitor
ever regenerates the project, and commit the resulting `project.pbxproj`.

The watch app is a tracker, not a second dashboard. `GET /mobile/watch/summary` answers the whole
screen in one call — the week by category, the next calendar event, and any timer already running —
and the ring it draws is a picker: press, drag out to a category, let go, choose a duration.
Starting a timer is `POST /mobile/tracking/start`, which writes a real calendar event and maps it
wholly to that category, so a session and a planned event are the same kind of thing by the time
anything reads the week back. `stop` and `extend` move that event's end. The one setting the watch
owns is where those events are written, on `CalendarSettingsView`.

Every screen goes through `SessionController`, the single answer to "what is running", and the week
plus the running session are written to the `group.com.elumixor.balance` App Group as a
`WatchSnapshot` — the widget reads that blob and never makes a call of its own. The entitlements
are committed on both watch targets and wired in by `wire_watch_targets.rb`; the group still has to
be ticked on all three bundle IDs in the Apple Developer portal, which the App Store Connect API
can't do, or the blob is written to a container nothing else can see and the widget shows its
placeholder.

The ring's geometry is `DialLayout` in BalanceKit, not a shape in either target: the app's wheel and
the widget's dial are the same week drawn at two sizes, and they used to disagree about it.

Reminders on the phone are the same reminders the Mac shows — when each is due is answered once, in
`src/lib/calendar/reminders.ts` — but they cannot be delivered the same way. iOS suspends the webview seconds
after the screen goes off, so nothing can be decided at the moment a reminder is due: the next two
days are worked out ahead and handed to iOS as local notifications, and the list is replaced
whenever the calendar or the preferences move. A reminder on a locked iPhone is mirrored to the
paired watch, which draws it with a scene of its own (`EventNotificationView.swift`) in the colour
of whatever the event counts as. `EventAlarm.swift` covers only the case the phone cannot — a watch
worn without the companion app installed — because a reminder scheduled on both sides buzzes twice.

An `.ics` file given to the app — shared into the phone from Mail, or dropped onto the Mac app or a
browser tab — opens as a list of what it holds, everything ticked, and the ticked events are written into Google
Calendar through the same API every other write goes through — five at a time, behind a bar, since
a term's timetable written one event after another takes as long as the round trips add up to. That is why the file goes to the app
and not to a share extension: the Clerk session lives in the webview, and an extension would need a
second copy of it to do the same work. `Info.plist` declares the calendar file types,
`IcsImportPlugin.swift` reads the URL iOS hands over and holds it if the file is what launched the
app, and `src/lib/calendar/ics.ts` — parser, no side effects, tested — decides what the file actually says.
The sheet asks two things of the whole file rather than of each event: which calendar the events
go to — every writable calendar of every connected account — and what they count as, which starts
at the buffer, since an hour nobody has planned already counts as that. A drop is the same thing without the native half: `IcsDropZone.svelte` reads the file the window
was given and hands it to the same sheet, and the macOS shell has to build its window with
`disable_drag_drop_handler()` or it catches the drop before the webview ever sees it.
Recurrence is read far enough to say "this repeats": the first occurrence is imported, and the row
says so.

## macOS

```bash
bunx devkit dev:mac       # the dev server, and the desktop shell against it
bunx devkit build:mac     # a release bundle, ad-hoc signed
cd apps/frontend && bun run desktop:install  # builds one and puts it in /Applications
```

The same SPA, wrapped in Tauri (`apps/frontend/src-tauri`). What the desktop adds is a menu bar
item: the event you're in the middle of and how much of it is left, or the next one and how soon,
with a dropdown of the days ahead. macOS renders that natively, so the Rust side owns the status
item and the webview pushes it a whole state through `update_tray` — the webview is the only half
that holds a Clerk session and knows what an event counts as, and there is no second, worse copy of
that logic in Rust. Closing the window hides it rather than quitting, because destroying the
webview would take both with it.

The Dock icon and the reminders follow the same rule (and the reminders themselves are shared with
the iOS build — see above). The webview draws today's date onto a canvas
and hands the shell the PNG — macOS forgets it on quit, so it is pushed again on every launch. And
a reminder is a small floating card, a second webview of the app's own `/reminder` route, because a
macOS notification cannot carry a Join button; the card is given its whole content in the URL and
asks the server nothing.

The bundle is served over `http://localhost:8123` rather than Tauri's `tauri://` custom protocol
(`tauri-plugin-localhost`, port pinned in `src-tauri/src/lib.rs`). WebKit gives a custom scheme no
cookie jar, and Clerk keeps the signed-in client in a cookie — on the custom protocol the app asked
for a password on every launch. It's the same fix the iOS build makes with `iosScheme: "https"`.
The port is fixed because an origin includes its port, and a moving one would lose the session it
was chosen to keep. That also makes the window a *remote* origin to Tauri's ACL, which is why
`capabilities/default.json` lists the URLs — without them there is no IPC and the menu bar never
updates. The same trap has a second half: a remote origin is refused every command the app defines
itself unless `build.rs` declares them in an app manifest *and* the capability grants each one. Miss
either and the built app fails silently — dev looked fine, and the menu bar simply never moved.

Signing in goes out through the browser: Google won't show a consent screen inside an embedded
webview, so the OAuth buttons open `/desktop-link` on the deployed web app instead. That page signs
in normally, trades its session for a one-minute Clerk ticket, and hands it back over
`balance-desktop://`. Email and password need none of this and work in the app directly. **The
hand-off only works against a deployed frontend and backend** — it is the live site the browser is
sent to.

The bundle is unsigned. That is fine for the machine that built it (nothing copied off local disk
carries a quarantine flag) and not fine for anyone else, who would need a Developer ID in
`bundle.macOS.signingIdentity`. Deep links also only resolve to an installed `.app`, so a
`devkit dev:mac` session hands its ticket to whatever is in `/Applications`.

The app keeps itself current. A menu bar item is opened once and then left running for weeks, so a
download nobody goes looking for again leaves everybody a month behind.
`src/lib/desktop/updates.svelte.ts` asks `/download/latest.json` on launch and every six hours, and
installs whatever is newer without asking — it only replaces files on disk, and nothing on screen
changes until the app restarts. The restart is what gets offered rather than taken: a row in the
menu bar, and a button in settings.

What makes that safe is the signature. Every update is signed with the key in
`TAURI_SIGNING_PRIVATE_KEY` and checked against the public key committed in `tauri.conf.json`, so a
deployment somebody else controls still can't put code on a machine. **Losing that private key means
no installed copy can ever be updated again** — it lives in the repo's `.env`, and in
`~/.tauri/balance.key` on the machine that made it.

## Linting

```bash
bun run lint       # biome check
bun run lint:fix   # biome check --write
bun run check      # svelte-check over the frontend
```

## Releasing

```bash
bun run deploy            # every platform, in dependency order
bunx devkit deploy:web    # builds here, uploads the finished output (`vercel deploy --prebuilt --prod`)
bunx devkit deploy:iphone # web bundle -> Xcode project -> fastlane `beta` -> TestFlight
bunx devkit deploy:mac    # macOS app + updater manifest -> `dist/download`, which the web serves
```

What each platform runs and what it waits for live in the `devkit.deploy` block of the root
`package.json`; `devkit deploy` runs them, drawing a line per platform and keeping the full logs in
`.devkit/deploy/`. The iOS half runs alongside the other two. The macOS app doesn't: the website
hands it out, so the DMG has to exist before Vercel packages the site, and a web deploy builds it
first. `updater` runs between them, packing the same `.app` as a signed tarball beside the DMG —
see `apps/frontend/scripts/stage-updater.ts`.

Everything is built on this machine — there is no CI doing it, and no tag to push. The iOS half
needs a working release setup locally: Homebrew Ruby (`brew install ruby`, macOS's own 2.6 is too
old for fastlane's gems), the "Apple Distribution" certificate in the login keychain, and an App
Store Connect API key. The key is read from `APP_STORE_CONNECT_API_KEY_PATH`, or
`~/.appstoreconnect/private_keys/AuthKey_<key id>.p8` by default; its id and issuer id go in the
repo's `.env` as `APP_STORE_CONNECT_API_KEY_ID` and `APP_STORE_CONNECT_API_KEY_ISSUER_ID`.

The app is bundled against `https://balance-app-mauve.vercel.app` — override with
`DEPLOY_API_BASE_URL` to point a TestFlight build somewhere else. `fastlane beta` picks the next
build number from TestFlight itself and writes it into the Xcode project and both watch targets'
`Info.plist`, so a release leaves those files changed — commit them.

Every native shell carries its own copy of the web app, built with its own API base URL, and both
`devkit build` and `devkit deploy` build them beside each other — so each gets its own output
directories (`BUILD_DIR`, `KIT_DIR`, `VITE_CACHE_DIR`) and `.vercelignore` keeps Vercel's file scan
out of them. The typed API client every one of those builds reads is generated once up front
(`devkit.generate`), rather than by each of them while the others are reading it.

Every version number in the repo is stamped from one place — `version` in
`apps/frontend/src-tauri/tauri.conf.json` — by `bun run version:sync`, configured under `devkit.version`
in the root `package.json`. It writes both `package.json`s, the Rust crate, `MARKETING_VERSION` in the Xcode project and
the watch/widget plists, so the App Store, the DMG and the line at the bottom of settings can't
disagree. Bump that one field to release a new version.

### The Mac app, from the website

`bun run deploy` builds the macOS bundle and stages `dist/download/` (the DMG plus a small
`desktop.json`), and the web build copies it next to the app, at `/download/Balance.dmg`. Settings
offers it — in a browser only, since the two app shells are already what it would install — and
draws the button from `desktop.json`, so a deployment that carries no DMG simply doesn't offer one.

The bundle is unsigned (there is no Developer ID certificate on this account yet), so the first
launch of a downloaded copy needs a right-click → Open. The panel says so.

The same deploy stages what the installed app reads: `Balance.app.tar.gz`, and a `latest.json`
naming its version and its signature. Nothing else has to happen for an update to reach a Mac —
bump the version (`bun run version:sync`), deploy, and every copy picks it up within six hours.

### Shipping without this machine

Both halves can also be built by CI, but never by a push — each is a button in the Actions tab, so
a merge to `main` still changes nothing that users see.

```bash
bunx devkit release ios  # tags the commit and pushes the tag; the iOS workflow picks it up
```

**iOS TestFlight** runs the same `fastlane beta` lane on a macOS runner, on an `ios-v*` tag or a
manual run. It needs `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`,
`APP_STORE_CONNECT_API_KEY_CONTENT`, `IOS_DIST_CERT_P12_BASE64` and `IOS_DIST_CERT_PASSWORD` as
repository secrets. **Vercel Deploy** is manual only: it pings a Vercel deploy hook
(`VERCEL_DEPLOY_HOOK_URL`), and Vercel builds `main` on its own machines.

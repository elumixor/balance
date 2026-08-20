# Balance

A time-balance tracker: decide how the 168 hours in your week should be spent, then let your own
calendar say what actually happened, and see the drift.

Google Calendar is the source of truth for events — nothing about them is stored here. What this
app adds is meaning: each event is mapped to an *activity* (a template that splits one hour across
several categories), or, as an exception, straight to categories. Drag an activity onto the week
and it becomes a real event in your calendar.

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
bun run dev       # devkit: runs backend + frontend side-by-side
bun run dev:open  # same, and opens the frontend URL once it's up
```

That's `backend` on `http://localhost:3100` and `frontend` on `http://localhost:8081`. To run just
one: `cd apps/backend && bun run dev`, or `cd apps/frontend && bun run dev`.

Both apps read their own `.env`. The backend needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`CLERK_SECRET_KEY`, and for the calendar integration `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` and
`OAUTH_STATE_SECRET` (the last two are `openssl rand -base64 32`). `GOOGLE_MAPS_API_KEY` is
optional and buys travel times to an event's address, through the Google Routes API; without it
`/mobile/travel` answers `{ available: false }` and the app offers no journeys at all. The frontend
needs `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL`. With
no `VITE_API_BASE_URL`, dev falls back to this machine's LAN address (so a phone on the same
network reaches the backend) and a release build falls back to the empty string, which is what
makes the deployed web app talk to its own origin.

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
cd apps/frontend
bun run ios       # live-reload against the dev server, then opens Xcode
bun run ios:prod  # bundles the production build into the app, then opens Xcode
bun run assets    # regenerates icons + splash screens from assets/icon.png
```

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

## macOS

```bash
bun run dev              # the dev server the desktop shell loads
bun run desktop          # runs the app against it
bun run desktop:install  # builds a release bundle and puts it in /Applications
```

The same SPA, wrapped in Tauri (`apps/frontend/src-tauri`). What the desktop adds is a menu bar
item: the event you're in the middle of and how much of it is left, or the next one and how soon,
with a dropdown of the days ahead. macOS renders that natively, so the Rust side owns the status
item and the webview pushes it a whole state through `update_tray` — the webview is the only half
that holds a Clerk session and knows what an event counts as, and there is no second, worse copy of
that logic in Rust. Closing the window hides it rather than quitting, because destroying the
webview would take both with it.

The Dock icon and the reminders follow the same rule. The webview draws today's date onto a canvas
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
`bun run desktop` session hands its ticket to whatever is in `/Applications`.

## Linting

```bash
bun run lint       # biome check
bun run lint:fix   # biome check --write
bun run check      # svelte-check over the frontend
```

## Releasing

```bash
bun run deploy          # all of the below, with their logs interleaved and labelled
bun run deploy:vercel   # builds here, uploads the finished output (`vercel deploy --prebuilt --prod`)
bun run deploy:ios      # web bundle -> Xcode project -> fastlane `beta` -> TestFlight
bun run deploy:desktop  # macOS app -> `dist/download`, which the web deployment then serves
```

The targets, what each one runs and what it waits for live in the `devkit.deploy` block of the root
`package.json`; `devkit deploy` runs them, drawing a line per target and keeping the full logs in
`.devkit/deploy/`. The iOS half runs alongside the other two. The macOS app doesn't: the website
hands it out, so the DMG has to exist before Vercel packages the site, and a web deploy builds it
first.

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

The builds run over the same sources with different settings at the same time, so the iOS one gets
its own output directories (`BUILD_DIR`, `KIT_DIR`, `VITE_CACHE_DIR`) and `.vercelignore` keeps
Vercel's file scan out of them; nothing else should need any of it.

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

### Shipping without this machine

Both halves can also be built by CI, but never by a push — each is a button in the Actions tab, so
a merge to `main` still changes nothing that users see.

```bash
bun run release:ios  # tags the commit and pushes the tag; the iOS workflow picks it up
```

**iOS TestFlight** runs the same `fastlane beta` lane on a macOS runner, on an `ios-v*` tag or a
manual run. It needs `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`,
`APP_STORE_CONNECT_API_KEY_CONTENT`, `IOS_DIST_CERT_P12_BASE64` and `IOS_DIST_CERT_PASSWORD` as
repository secrets. **Vercel Deploy** is manual only: it pings a Vercel deploy hook
(`VERCEL_DEPLOY_HOOK_URL`), and Vercel builds `main` on its own machines.

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
| `e2e`                 | Playwright suite, driven against the app's web build                   |

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
`OAUTH_STATE_SECRET` (the last two are `openssl rand -base64 32`). The frontend needs `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL`. With
no `VITE_API_BASE_URL`, dev falls back to this machine's LAN address (so a phone on the same
network reaches the backend) and a release build falls back to the empty string, which is what
makes the deployed web app talk to its own origin.

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
one function for `/mobile/*` and `/health`. Pushing to `main` deploys it. Any path that isn't an
API prefix answers with the app shell, and the client router takes it from there.

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

The watch app writes a snapshot of the week's most off-target category that the widget reads
through the
`group.com.elumixor.balance` App Group. That group has to be ticked on all three bundle IDs in the
Apple Developer portal — the App Store Connect API can't do it — and the entitlement added to both
watch targets. Until then the widget falls back to its placeholder, which is where it has been
since before the Capacitor move.

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

The bundle is served over `http://localhost:8123` rather than Tauri's `tauri://` custom protocol
(`tauri-plugin-localhost`, port pinned in `src-tauri/src/lib.rs`). WebKit gives a custom scheme no
cookie jar, and Clerk keeps the signed-in client in a cookie — on the custom protocol the app asked
for a password on every launch. It's the same fix the iOS build makes with `iosScheme: "https"`.
The port is fixed because an origin includes its port, and a moving one would lose the session it
was chosen to keep. That also makes the window a *remote* origin to Tauri's ACL, which is why
`capabilities/default.json` lists the URLs — without them there is no IPC and the menu bar never
updates.

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

## Tests

```bash
bun run test:e2e     # starts both dev servers, then runs Playwright
```

The suite signs in as a `+clerk_test` account, so it uses Clerk's fixed `424242` code instead of a
real email.

## Releasing iOS

```bash
bun run release:ios  # tags the commit; GitHub Actions builds and ships to TestFlight
```

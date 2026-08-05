# Balance

A time-balance tracker: decide how the 168 hours in your week should be spent, track what you
actually do, and see the drift.

## Layout

| Path                  | What it is                                                            |
| --------------------- | --------------------------------------------------------------------- |
| `apps/frontend`       | SvelteKit app (static SPA), shipped to iOS inside a Capacitor webview  |
| `apps/frontend/ios`   | The Capacitor Xcode project, committed — including the watch targets   |
| `apps/frontend/watch` | watchOS companion app + widget, in Swift                               |
| `apps/backend`        | Nitro JSON API over Postgres (Neon) with Drizzle                       |
| `apple`               | Shared BalanceKit Swift package + fastlane release lane                |
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

Both apps read their own `.env`. The backend needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and
`CLERK_SECRET_KEY`; the frontend needs `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL`. With
no `VITE_API_BASE_URL`, dev falls back to this machine's LAN address (so a phone on the same
network reaches the backend) and a release build falls back to the empty string, which is what
makes the deployed web app talk to its own origin.

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

The Xcode project is committed. Capacitor only knows about the single iOS target, so the watchOS
app and its widget are wired in by `apps/frontend/scripts/watch-targets.rb` — re-run it (it is
idempotent) if Capacitor ever regenerates the project.

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

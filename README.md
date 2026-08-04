# Balance

A time-balance tracker: decide how the 168 hours in your week should be spent, track what you
actually do, and see the drift.

## Layout

| Path            | What it is                                                   |
| --------------- | ------------------------------------------------------------ |
| `apps/frontend` | Expo (React Native + web) app, routed with expo-router        |
| `apps/backend`  | Nitro JSON API over Postgres (Neon) with Drizzle              |
| `apple`         | Shared BalanceKit Swift package + fastlane release lane        |
| `apps/frontend/targets` | watchOS companion app + widget, linked into the Expo iOS project by `@bacons/apple-targets` |
| `e2e`           | Playwright suite, driven against the app's web build          |

Auth is Clerk on both sides; the frontend sends its session token to `/mobile/*`.

## Running it

```bash
bun install
bun run dev       # devkit: runs backend + frontend web side-by-side
bun run dev:open  # same, and opens the frontend URL once it's up
```

That's `backend` on `http://localhost:3000` and `frontend` (Expo web) on `http://localhost:8081`.
To run just one, or a native simulator: `cd apps/backend && bun run dev`, or
`cd apps/frontend && bun run start` (press "w" for web, "i" for a simulator).

Both apps read their own `.env`. The backend needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and
`CLERK_SECRET_KEY`; the frontend needs `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`EXPO_PUBLIC_API_BASE_URL`.

The frontend's typed API client (`apps/frontend/lib/api-client`) is generated from the backend's
route handlers — run `cd apps/backend && bunx nitro-client` after changing a `server/routes/mobile/**`
handler's schema or response shape, and commit the regenerated output.

## Linting

```bash
bun run lint       # biome check
bun run lint:fix   # biome check --write
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

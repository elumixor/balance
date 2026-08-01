# Balance

A time-balance tracker: decide how the 168 hours in your week should be spent, track what you
actually do, and see the drift.

## Layout

| Path            | What it is                                                   |
| --------------- | ------------------------------------------------------------ |
| `apps/frontend` | Expo (React Native + web) app, routed with expo-router        |
| `apps/backend`  | Nitro JSON API over Postgres (Neon) with Drizzle              |
| `apple`         | Native iOS + watchOS project, released through fastlane       |
| `e2e`           | Playwright suite, driven against the app's web build          |

Auth is Clerk on both sides; the frontend sends its session token to `/mobile/*`.

## Running it

```bash
bun install

cd apps/backend && bun run dev       # http://localhost:3000
cd apps/frontend && bun run start    # press "w" for web, "i" for a simulator
```

Both apps read their own `.env`. The backend needs `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and
`CLERK_SECRET_KEY`; the frontend needs `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`EXPO_PUBLIC_API_BASE_URL`.

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

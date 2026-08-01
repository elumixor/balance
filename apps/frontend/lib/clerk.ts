// Clerk publishable keys are public identifiers (not secrets) — safe to ship in the client bundle.
// Hardcoded rather than sourced from EXPO_PUBLIC_* env inlining, which proved unreliable under Bun/Metro.
const DEFAULT_CLERK_PUBLISHABLE_KEY = "pk_test_Y2VudHJhbC1jb25kb3ItMzguY2xlcmsuYWNjb3VudHMuZGV2JA";

export const CLERK_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || DEFAULT_CLERK_PUBLISHABLE_KEY;

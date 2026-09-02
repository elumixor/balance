import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

/**
 * The unit tests run without SvelteKit: the plugin wants a built router and an app directory, and
 * nothing under test here is a route. What is needed is the Svelte compiler — `.svelte.ts` modules
 * are runes source, not TypeScript — and the `$lib` alias the source is written against.
 */
export default defineConfig({
  plugins: [svelte({ compilerOptions: { dev: true } })],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
    // Svelte ships a server build too, and the runes in it are no-ops that would pass every test.
    conditions: ["browser"],
  },
  test: {
    // `localStorage` is not a detail of the tests — half of what `persist` does is cope with it
    // being absent, full, or holding somebody else's data.
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      /**
       * Only what the tests actually claim. A blanket `src/**` would report a number nobody can
       * act on — most of this app is components and pointer handling that a DOM-less runner can't
       * say anything true about. A module joins this list when its tests cover it completely, and
       * the thresholds below are what keep it that way.
       */
      include: [
        "src/lib/cache.svelte.ts",
        "src/lib/colors.ts",
        "src/lib/dates.ts",
        "src/lib/format.ts",
        "src/lib/ics.ts",
        "src/lib/meeting.ts",
        "src/lib/persist.ts",
        "src/lib/planning/zone.ts",
        "src/lib/reminders.ts",
        "src/lib/splits.ts",
        "src/lib/store.svelte.ts",
        "src/lib/calendar/event-category.ts",
        "src/lib/calendar/markers.ts",
        "src/lib/calendar/project-hours.ts",
        "src/lib/projects/decide-on.ts",
        "src/lib/calendar/history.svelte.ts",
        "src/lib/calendar/time-scale.svelte.ts",
        "src/lib/calendar/week-grid.ts",
        "src/lib/calendar/week-totals.ts",
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});

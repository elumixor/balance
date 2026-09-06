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
        "src/lib/core/cache.svelte.ts",
        "src/lib/ui/colors.ts",
        "src/lib/calendar/dates.ts",
        "src/lib/ui/format.ts",
        "src/lib/calendar/ics.ts",
        "src/lib/integrations/sleep-score.ts",
        "src/lib/integrations/sleep-sessions.ts",
        "src/lib/integrations/sleep-summary.ts",
        "src/lib/calendar/meeting.ts",
        "src/lib/core/persist.ts",
        "src/lib/planning/rating.ts",
        "src/lib/planning/zone.ts",
        "src/lib/calendar/reminder-lead.ts",
        "src/lib/calendar/reminders.ts",
        "src/lib/calendar/time-zones.ts",
        "src/lib/core/store.svelte.ts",
        "src/lib/calendar/event-category.ts",
        "src/lib/calendar/filler.ts",
        "src/lib/calendar/markers.ts",
        "src/lib/calendar/project-hours.ts",
        "src/lib/calendar/recurrence.ts",
        "src/lib/projects/allocate.ts",
        "src/lib/projects/decide-on.ts",
        "src/lib/projects/ranking.ts",
        "src/lib/calendar/history.svelte.ts",
        "src/lib/calendar/time-scale.svelte.ts",
        "src/lib/calendar/week-grid.ts",
        "src/lib/calendar/week-totals.ts",
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});

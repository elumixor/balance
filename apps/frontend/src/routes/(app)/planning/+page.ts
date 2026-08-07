import { redirect } from "@sveltejs/kit";

/** Planning has no landing of its own — the plan's shape is where the work starts. */
export const load = () => redirect(307, "/planning/week");

import { CalendarDays, ChartPie } from "lucide-svelte";

/**
 * The two halves of the app: the week as it happens, and the week as you meant it to go.
 * Planning holds its own two sections — the plan's shape, and the activities that fill it.
 */
export const NAV_TABS = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/planning", label: "Planning", icon: ChartPie },
];

/** A tab stays lit for everything under it, so Planning's own sections don't unlight the rail. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

import { CalendarDays, ChartPie, Sunrise } from "lucide-svelte";
import { syncing } from "./store.svelte";

/**
 * The three halves of the app: the week as it happens, the week as you meant it to go, and the
 * daily sitting that turns one into the other.
 * Planning holds its own two sections — the plan's shape, and the activities that fill it.
 *
 * `syncing` is read as a function so the nav can ask each tab whether its data is being checked
 * without the tab bar knowing what either screen is made of.
 *
 * `key` is the screen's own letter, pressed on its own — the rail shows icons, so the name and the
 * shortcut both live in the tooltip rather than on the button.
 */
export const NAV_TABS = [
  { href: "/calendar", label: "Calendar", key: "c", icon: CalendarDays, syncing: () => syncing.calendar },
  { href: "/planning", label: "Planning", key: "p", icon: ChartPie, syncing: () => syncing.planning },
  // Normally opened from its own reminder. It is a tab as well because a ritual you can only
  // reach by being interrupted is a ritual you can't start on the day you decide to.
  { href: "/session", label: "Session", key: "s", icon: Sunrise, syncing: () => false },
];

/** A tab stays lit for everything under it, so Planning's own sections don't unlight the rail. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

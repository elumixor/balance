import { CalendarDays, ChartPie } from "lucide-svelte";
import { syncing } from "./store.svelte";

/**
 * The two halves of the app: the week as it happens, and the week as you meant it to go.
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
];

/** A tab stays lit for everything under it, so Planning's own sections don't unlight the rail. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

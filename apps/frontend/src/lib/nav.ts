import { CalendarDays, ChartPie, Hexagon } from "lucide-svelte";
import { syncing } from "./store.svelte";

/**
 * The three views of the app: the week as it happens, the week as you meant it to go, and the
 * projects those hours are for.
 * The daily sitting is not among them — it is something the app asks for on the two days a day it
 * is worth asking, and a tab for it sat there saying nothing for the other twenty-three hours.
 * `SessionNudge` is where it appears instead, only while it is owed.
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
  { href: "/projects", label: "Projects", key: "j", icon: Hexagon, syncing: () => syncing.projects },
];

/** A tab stays lit for everything under it, so Planning's own sections don't unlight the rail. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

import { CalendarDays, ChartPie } from "lucide-svelte";
import { syncing } from "$lib/core/store.svelte";

/**
 * The two views of the app: the week as it happens, and the week as you mean it to go — the
 * spheres it is cut into and the projects those hours are for, on one screen.
 * The daily sitting is not among them — it is something the app asks for on the two days a day it
 * is worth asking, and a tab for it sat there saying nothing for the other twenty-three hours.
 * `SessionNudge` is where it appears instead, only while it is owed.
 *
 * `syncing` is read as a function so the nav can ask each tab whether its data is being checked
 * without the tab bar knowing what either screen is made of.
 *
 * `key` is the screen's own letter, pressed on its own — the strip shows icons, so the name and the
 * shortcut both live in the tooltip rather than on the button.
 */
export const NAV_TABS = [
  {
    href: "/calendar",
    label: "Calendar",
    key: "c",
    icon: CalendarDays,
    syncing: () => syncing.calendar,
  },
  {
    href: "/projects",
    label: "Projects",
    key: "p",
    icon: ChartPie,
    syncing: () => syncing.projects,
  },
];

/** A tab stays lit for everything under it, so an open project doesn't unlight the rail. */
export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

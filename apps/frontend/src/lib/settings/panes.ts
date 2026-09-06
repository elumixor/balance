import type { Icon as IconType } from "lucide-svelte";
import { Bell, CalendarDays, Globe, MapPin, Plug, UserRound } from "lucide-svelte";

/** The sections of the settings panel, in the order they are laid out and the rail lists them. */
export type Pane = "general" | "notifications" | "places" | "zones" | "calendars" | "integrations";

export interface PaneInfo {
  value: Pane;
  label: string;
  icon: typeof IconType;
  /** What somebody might type to get here — the words on the section, not its name. */
  keywords: string;
}

export const PANES: PaneInfo[] = [
  {
    value: "general",
    label: "Profile",
    icon: UserRound,
    keywords: "account email sign out stars recap plan theme appearance dark light mac update login build version",
  },
  {
    value: "notifications",
    label: "Notifications",
    icon: Bell,
    keywords: "planning sessions evening morning week reminders remind events leave sound minutes before",
  },
  {
    value: "places",
    label: "Places & travel",
    icon: MapPin,
    keywords: "home office address journey route transit driving walking cycling",
  },
  { value: "zones", label: "Time zones", icon: Globe, keywords: "city gmt offset zone" },
  {
    value: "calendars",
    label: "Calendars",
    icon: CalendarDays,
    keywords: "google account connect drawn default new events land",
  },
  { value: "integrations", label: "Integrations", icon: Plug, keywords: "apple health sleep sync feed" },
];

/** The sections whose name or words contain the query; every section for an empty one. */
export function matchingPanes(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return PANES;
  return PANES.filter((pane) => `${pane.label} ${pane.keywords}`.toLowerCase().includes(needle));
}

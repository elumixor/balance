import type { Icon as IconType } from "lucide-svelte";
import { Bell, CalendarDays, Globe, Inbox, MapPin, Plug, Settings2, SlidersHorizontal, Star } from "lucide-svelte";

/** The pages of the settings panel, in the order the rail lists them. */
export type Pane = "stars" | "inbox" | "general" | "planning" | "reminders" | "places" | "zones" | "calendars" | "integrations";

export const PANES: { value: Pane; label: string; icon: typeof IconType }[] = [
  { value: "stars", label: "Stars", icon: Star },
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "general", label: "General", icon: Settings2 },
  { value: "planning", label: "Planning", icon: SlidersHorizontal },
  { value: "reminders", label: "Reminders", icon: Bell },
  { value: "places", label: "Places & travel", icon: MapPin },
  { value: "zones", label: "Time zones", icon: Globe },
  { value: "calendars", label: "Calendars", icon: CalendarDays },
  { value: "integrations", label: "Integrations", icon: Plug },
];

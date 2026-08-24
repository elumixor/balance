import type { Icon as IconType } from "lucide-svelte";
import { Bell, CalendarDays, MapPin, Settings2, SlidersHorizontal } from "lucide-svelte";

/** The pages of the settings panel, in the order the rail lists them. */
export type Pane = "general" | "planning" | "reminders" | "places" | "calendars";

export const PANES: { value: Pane; label: string; icon: typeof IconType }[] = [
  { value: "general", label: "General", icon: Settings2 },
  { value: "planning", label: "Planning", icon: SlidersHorizontal },
  { value: "reminders", label: "Reminders", icon: Bell },
  { value: "places", label: "Places & travel", icon: MapPin },
  { value: "calendars", label: "Calendars", icon: CalendarDays },
];

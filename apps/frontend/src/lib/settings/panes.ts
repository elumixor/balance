import type { Icon as IconType } from "lucide-svelte";
import {
  Bell,
  CalendarDays,
  Globe,
  MapPin,
  Plug,
  UserRound,
} from "lucide-svelte";

/** The pages of the settings panel, in the order the rail lists them. */
export type Pane =
  | "general"
  | "notifications"
  | "places"
  | "zones"
  | "calendars"
  | "integrations";

export const PANES: { value: Pane; label: string; icon: typeof IconType }[] = [
  { value: "general", label: "Profile", icon: UserRound },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "places", label: "Places & travel", icon: MapPin },
  { value: "zones", label: "Time zones", icon: Globe },
  { value: "calendars", label: "Calendars", icon: CalendarDays },
  { value: "integrations", label: "Integrations", icon: Plug },
];

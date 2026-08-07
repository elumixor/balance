import { CalendarDays, ChartPie, Scale, Shapes } from "lucide-svelte";

/** The four screens, in the order the week is worked: schedule it, weigh it, plan it, define it. */
export const NAV_TABS = [
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/stats", label: "Balance", icon: Scale },
  { href: "/categories", label: "Week", icon: ChartPie },
  { href: "/activities", label: "Activities", icon: Shapes },
];

import { ChartPie, Scale, Shapes, Timer } from "lucide-svelte";

/** The four screens, in the order the week is worked: track it, weigh it, plan it, define it. */
export const NAV_TABS = [
  { href: "/track", label: "Track", icon: Timer },
  { href: "/stats", label: "Balance", icon: Scale },
  { href: "/categories", label: "Week", icon: ChartPie },
  { href: "/activities", label: "Activities", icon: Shapes },
];

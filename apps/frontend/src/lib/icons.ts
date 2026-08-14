import {
  Baby,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  Circle,
  CircleDashed,
  Code,
  Coffee,
  Compass,
  Dumbbell,
  Flame,
  Gamepad2,
  GraduationCap,
  Handshake,
  Heart,
  HeartPulse,
  House,
  Leaf,
  Lightbulb,
  MessageCircle,
  Moon,
  Mountain,
  Music,
  Palette,
  PawPrint,
  PenTool,
  PiggyBank,
  Plane,
  Rocket,
  Salad,
  ShoppingCart,
  Sparkles,
  Sun,
  Tent,
  Users,
  Utensils,
  Wallet,
  Waves,
} from "lucide-svelte";

/** Every Lucide icon is the same component shape; one of them stands in for the type of all. */
type IconComponent = typeof Circle;

/**
 * The icons a category can wear. A small, hand-picked set rather than all of Lucide: the row of
 * categories should read as one alphabet, and a grid you can scan in a second beats a search box.
 * Names are stored on the category, so entries may be renamed only alongside a data migration.
 */
export const categoryIcons: Record<string, IconComponent> = {
  circle: Circle,
  "circle-dashed": CircleDashed,
  moon: Moon,
  sun: Sun,
  flame: Flame,
  sparkles: Sparkles,
  heart: Heart,
  "heart-pulse": HeartPulse,
  brain: Brain,
  leaf: Leaf,
  waves: Waves,
  mountain: Mountain,
  tent: Tent,
  house: House,
  briefcase: Briefcase,
  code: Code,
  "pen-tool": PenTool,
  palette: Palette,
  camera: Camera,
  music: Music,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  lightbulb: Lightbulb,
  rocket: Rocket,
  compass: Compass,
  plane: Plane,
  bike: Bike,
  dumbbell: Dumbbell,
  gamepad: Gamepad2,
  coffee: Coffee,
  utensils: Utensils,
  salad: Salad,
  users: Users,
  handshake: Handshake,
  "message-circle": MessageCircle,
  baby: Baby,
  "paw-print": PawPrint,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  "shopping-cart": ShoppingCart,
};

export const iconNames = Object.keys(categoryIcons);

export const DEFAULT_ICON = "circle";

/** An unknown name (an older client's icon, a hand-edited row) still draws as something. */
export const iconFor = (name: string | undefined): IconComponent => categoryIcons[name ?? ""] ?? Circle;

/**
 * A new category starts with an icon it didn't have to be asked for. The two placeholder shapes
 * are skipped, and so is anything already on screen, so a fresh row looks distinct on arrival.
 */
export function randomIcon(taken: string[] = []): string {
  const pool = iconNames.filter((name) => name !== "circle" && name !== "circle-dashed" && !taken.includes(name));
  const from = pool.length > 0 ? pool : iconNames;
  return from[Math.floor(Math.random() * from.length)];
}

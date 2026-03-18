import { Heart, Sun, Sword, Brain } from "lucide-react";

/** The four Yty elements — the core values of the School of Gaming. */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: Heart,
    color: {
      bg: "bg-emerald-500/10",
      bgGradient: "from-emerald-500/10 to-emerald-500/5",
      border: "border-emerald-500/30",
      accent: "text-emerald-400",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: Sun,
    color: {
      bg: "bg-amber-500/10",
      bgGradient: "from-amber-500/10 to-amber-500/5",
      border: "border-amber-500/30",
      accent: "text-amber-400",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with the world",
    icon: Sword,
    color: {
      bg: "bg-rose-500/10",
      bgGradient: "from-rose-500/10 to-rose-500/5",
      border: "border-rose-500/30",
      accent: "text-rose-400",
    },
  },
  {
    id: "common_sense",
    name: "Common Sense",
    description: "Your relationship with media & tech",
    icon: Brain,
    color: {
      bg: "bg-violet-500/10",
      bgGradient: "from-violet-500/10 to-violet-500/5",
      border: "border-violet-500/30",
      accent: "text-violet-400",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];

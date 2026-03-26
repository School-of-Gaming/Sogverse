import { Heart, Sun, Sword, Brain } from "lucide-react";

/** The four Yty elements — the core values of the School of Gaming. */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: Heart,
    color: {
      bg: "bg-yty-harmony/10",
      bgGradient: "from-yty-harmony/10 to-yty-harmony/5",
      border: "border-yty-harmony/30",
      accent: "text-yty-harmony",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: Sun,
    color: {
      bg: "bg-yty-glow/10",
      bgGradient: "from-yty-glow/10 to-yty-glow/5",
      border: "border-yty-glow/30",
      accent: "text-yty-glow",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with the world",
    icon: Sword,
    color: {
      bg: "bg-yty-valor/10",
      bgGradient: "from-yty-valor/10 to-yty-valor/5",
      border: "border-yty-valor/30",
      accent: "text-yty-valor",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with media & tech",
    icon: Brain,
    color: {
      bg: "bg-yty-wit/10",
      bgGradient: "from-yty-wit/10 to-yty-wit/5",
      border: "border-yty-wit/30",
      accent: "text-yty-wit",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];

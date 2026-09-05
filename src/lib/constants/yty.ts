import { Heart, Sun, Sword, Brain } from "lucide-react";

/**
 * The Four Yty-Elements — the core values of School of Gaming. The names and
 * descriptions here are the canonical English wording; the rendered copy comes
 * from the `yty.elements.*` messages, which carry the same words per locale.
 *
 * Each element's classes name the @sog/ui family pair — `-strong` for fills,
 * rings and glows, `-soft` for ink and glyphs. These alpha steps are the
 * pre-library recipe and are replaced when the Yty recipe is ruled.
 */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: Heart,
    color: {
      bg: "bg-yty-harmony-strong/10",
      bgGradient: "from-yty-harmony-strong/10 to-yty-harmony-strong/5",
      accent: "text-yty-harmony-soft",
      ring: "ring-yty-harmony-strong",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: Sun,
    color: {
      bg: "bg-yty-glow-strong/10",
      bgGradient: "from-yty-glow-strong/10 to-yty-glow-strong/5",
      accent: "text-yty-glow-soft",
      ring: "ring-yty-glow-strong",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    icon: Sword,
    color: {
      bg: "bg-yty-valor-strong/10",
      bgGradient: "from-yty-valor-strong/10 to-yty-valor-strong/5",
      accent: "text-yty-valor-soft",
      ring: "ring-yty-valor-strong",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    icon: Brain,
    color: {
      bg: "bg-yty-wit-strong/10",
      bgGradient: "from-yty-wit-strong/10 to-yty-wit-strong/5",
      accent: "text-yty-wit-soft",
      ring: "ring-yty-wit-strong",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];

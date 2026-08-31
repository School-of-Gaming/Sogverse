import type { YtyPalette } from "@/lib/constants/yty";

/**
 * **Design-pass draft — the enrollment card's state colours under the proposed
 * grammar.**
 *
 * The grammar assigns one meaning per family: amber = act, harmony = people,
 * glow = growth, wit = knowledge, valor = adventure. Two of the card's three
 * coloured states already carry a functional token that lands inside a brand
 * family, so the draft is mostly a *convergence* rather than a repaint — which
 * is the point, and is why the two columns look nearly identical:
 *
 * - **The live card's edge stays amber.** Live means there is a room to join,
 *   and the Join is the act; amber is the act colour, so the one state whose
 *   card is asking for a click keeps the colour that asks for clicks. Its wash
 *   is a same-hue fade to transparent — a wash, not a two-hue blend — so the
 *   flat default leaves it alone.
 * - **The Live badge takes the glow family**, where it takes `--success` today.
 *   Growth reads a child's session better than "success" does, and it is the
 *   same green either way once the status tokens converge.
 * - **Awaiting placement takes the wit family**, where it takes `--info` today.
 *   Knowledge is "we are telling you something", which is exactly what that
 *   state's sentence does.
 *
 * The queue place is deliberately still uncoloured. Warning amber is reserved
 * for it in the grammar, but nothing is wrong with a place in line, and the card
 * has said so in muted body text since it was designed — colouring it now would
 * make the grammar louder than the meaning.
 *
 * Contrast, on the card ground: glow-soft over its own strong 10% tint is
 * 7.20:1 and wit-soft on the card is 7.57:1, both against the 4.5:1 body bar.
 * Every glyph clears the 3:1 bar by a wide margin. Classes are literal strings
 * because Tailwind scans source text, and the `current` entry holds each class
 * string **whole and in its original order**, so the live path's rendered
 * `className` is byte-for-byte what it was before this map existed.
 *
 * **It lives in a module of its own rather than beside the card**, and that is
 * load-bearing: the card is a `"use client"` module, so every export of it
 * becomes a client reference when a server component imports it, and the design
 * pass's walkthrough deck is a server component that needs to *read* these
 * strings to draw today beside the draft. Dotting into a client module from the
 * server throws. Both this file and the card retire together at promotion.
 */
export interface EnrollmentDraftTones {
  /** The live card's edge and wash. */
  live: string;
  /** The awaiting-placement card's edge and wash. */
  awaiting: string;
  /** The Live badge's border, tint and label. */
  liveBadge: string;
  /** The awaiting-placement glyph in the footer. */
  awaitingGlyph: string;
}

export const ENROLLMENT_TONES: Record<YtyPalette, EnrollmentDraftTones> = {
  current: {
    live: "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
    awaiting: "border-info/40 bg-gradient-to-r from-info/5 to-transparent",
    liveBadge:
      "gap-1 border-success/50 bg-success/10 px-2 py-0 text-[10px] uppercase tracking-wide text-success",
    awaitingGlyph: "mt-0.5 h-4 w-4 shrink-0 text-info",
  },
  brand: {
    live: "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
    awaiting:
      "border-yty-wit-strong/40 bg-gradient-to-r from-yty-wit-strong/5 to-transparent",
    liveBadge:
      "gap-1 border-yty-glow-strong/50 bg-yty-glow-strong/10 px-2 py-0 text-[10px] uppercase tracking-wide text-yty-glow-soft",
    awaitingGlyph: "mt-0.5 h-4 w-4 shrink-0 text-yty-wit-soft",
  },
  /** Dose is a home-page question; a dashboard card takes the one draft. */
  "brand-lively": {
    live: "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
    awaiting:
      "border-yty-wit-strong/40 bg-gradient-to-r from-yty-wit-strong/5 to-transparent",
    liveBadge:
      "gap-1 border-yty-glow-strong/50 bg-yty-glow-strong/10 px-2 py-0 text-[10px] uppercase tracking-wide text-yty-glow-soft",
    awaitingGlyph: "mt-0.5 h-4 w-4 shrink-0 text-yty-wit-soft",
  },
};

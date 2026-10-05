import { Brain, Ship, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { GeduBadge } from "@/types";

/**
 * One badge's artwork: its glyph and its own three colours — the ring, the
 * disc inside it, and the glyph on the disc.
 *
 * Keyed by the badge in a `Record`, so a badge added to the enum fails
 * type-check here until it has art. The colours are the badge's own palette,
 * the artwork exemption in SOG-UI's colour rules, which is why they are hexes
 * rather than theme tokens: no token means "this badge", and a badge must not
 * borrow a status or a Yty colour that means something else.
 *
 * **Temporary art.** A medal drawn from a lucide glyph holds the slot until
 * the real pixel art arrives, and the real art replaces this table and the
 * drawing below without any caller changing.
 *
 * - **Neuroinclusive** is the brain, in teal.
 * - **Flagship** is the ship, in gold on navy. A flagship is the lead ship of
 *   a fleet, and the ship says that literally. The flag was the other
 *   candidate and lost: on its own it reads as "reported" or "flagged", which
 *   is the wrong thing to hang on an educator. The anchor reads as harbour and
 *   steadiness rather than leading, and the sailboat as a day out.
 */
const BADGE_ART: Record<
  GeduBadge,
  { glyph: LucideIcon; ring: string; disc: string; ink: string }
> = {
  neuroinclusive: {
    glyph: Brain,
    ring: "#2EC4B6",
    disc: "#123F3B",
    ink: "#B5F2EA",
  },
  flagship: {
    glyph: Ship,
    ring: "#E0B341",
    disc: "#1C2B4A",
    ink: "#F5DC93",
  },
};

/** The two sizes a badge is drawn at: beside a row of text, and in the case. */
const SIZES = {
  sm: { box: 40, glyph: 18, ring: 3 },
  lg: { box: 96, glyph: 42, ring: 6 },
} as const;

export type BadgeArtSize = keyof typeof SIZES;

interface BadgeArtProps {
  badge: GeduBadge;
  /** Whether the person holds it. An unearned badge is greyed and static. */
  earned: boolean;
  size?: BadgeArtSize;
}

/**
 * A badge's picture — the single place any badge's art lives.
 *
 * Named `BadgeArt` because `Badge` is already the status pill in `ui/`.
 *
 * **Unearned is greyscale and muted, and never moves**: the picture is the
 * same shape either way, so a badge case reads as a set with gaps rather than
 * as two different kinds of thing, and nothing an educator has not earned asks
 * for their attention. Nothing animates in either state today.
 *
 * It names itself — the badge's name, and whether it is still to be earned —
 * so a screen reader hears what a sighted reader sees in the colour.
 */
export function BadgeArt({ badge, earned, size = "sm" }: BadgeArtProps) {
  const t = useTranslations("badges");
  const art = BADGE_ART[badge];
  const dims = SIZES[size];
  const Glyph = art.glyph;
  const name = t(`gedu.${badge}.name`);

  return (
    <span
      role="img"
      aria-label={earned ? t("art.earned", { name }) : t("art.unearned", { name })}
      data-earned={earned}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        !earned && "opacity-50 grayscale",
      )}
      style={{
        width: dims.box,
        height: dims.box,
        backgroundColor: art.disc,
        // The medal: a solid outer ring, a band of the disc, and a hairline of
        // the ring's colour inside it.
        boxShadow: [
          `inset 0 0 0 ${dims.ring}px ${art.ring}`,
          `inset 0 0 0 ${dims.ring * 2}px ${art.disc}`,
          `inset 0 0 0 ${dims.ring * 2 + 1}px ${art.ring}`,
        ].join(", "),
      }}
    >
      <Glyph
        aria-hidden
        width={dims.glyph}
        height={dims.glyph}
        style={{ color: art.ink }}
      />
    </span>
  );
}

import { createHash } from "node:crypto";
import { PICKS } from "@sog/ui";
import { DARK_THEME } from "@/lib/constants/colors";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/**
 * The team member's share card: its address, its version, the numbers the
 * drawing is built from, and the portrait's frame. The route that draws it is
 * `src/app/opengraph-images/team/[userId]/route.tsx`; it shares the site
 * cards' shape (`./cards`) — a root-level route handler the proxy's matcher
 * excludes, the locale as a query parameter — and differs from them in one
 * thing, its caching, for the reason given at `TEAM_CARD_CACHE_CONTROL`.
 */

/** The path the card of the person with this id is served at. */
export function teamCardPath(userId: string): string {
  return `/opengraph-images/team/${encodeURIComponent(userId)}`;
}

/**
 * **The version of a card: a digest of everything the card shows at this
 * locale** — the photo's own version token, the names, the title, the pick and
 * the intro the locale resolves to (with the locale it resolves to). The
 * catalog copy the card also draws ("Gedu · Game Educator") is not in it: that
 * changes only with a deploy, as the site cards' copy does.
 *
 * It exists for the caches we do not control. A link preview stores the image
 * under its URL, often for weeks, and ignores our headers; a new URL is the
 * only thing that makes it fetch again. The route itself ignores the value and
 * draws whatever the profile says now.
 */
export function teamCardVersion(
  person: TeamProfile,
  locale: SupportedLocale,
): string {
  const written = resolveTranslation(person.translations, locale);
  const shown = [
    person.kind,
    person.firstName,
    person.nickname,
    person.kind === "admin" ? person.lastName : null,
    person.kind === "admin" ? person.title : null,
    person.pick,
    person.photo?.src ?? null,
    written?.locale ?? null,
    written?.shortDescription ?? null,
  ];
  return createHash("sha256")
    .update(JSON.stringify(shown))
    .digest("hex")
    .slice(0, 16);
}

/**
 * The URL a profile page points its `og:image` at: relative, like the site
 * cards' (`ogCardUrl`), and carrying the version, so a card that would look
 * different is a different address.
 */
export function teamCardUrl(
  person: TeamProfile,
  locale: SupportedLocale,
): string {
  return `${teamCardPath(person.id)}?locale=${locale}&v=${teamCardVersion(person, locale)}`;
}

/**
 * **Five minutes, public, no stale serving — not the site cards' year.** The
 * route draws the profile as it is now whatever `v` it is asked for, so a
 * year-long cache would pin a card under an address that is not its own: a
 * profile changed and then changed back would go on sharing the version in
 * between for a year. Nobody waits on the card — a link preview keeps its own
 * copy and a share fetches it once — so the long cache would buy nothing
 * (owner decision, 2026-10-05). The versioned URL is what keeps the short
 * cache cheap: an unchanged card is still one URL, re-drawn at most once per
 * five minutes per cache, and a changed one is a new URL at once.
 */
export const TEAM_CARD_CACHE_CONTROL = "public, max-age=300, s-maxage=300";

/**
 * **The card's layout, in pixels of its 1200×630.** The text column's width is
 * what is left beside the portrait, and it is what the headline is fitted to.
 */
export const TEAM_CARD_LAYOUT = {
  sideMargin: 56,
  portraitWidth: 400,
  portraitHeight: 500,
  gap: 52,
} as const;

export const TEAM_CARD_COLUMN_WIDTH =
  1200 -
  2 * TEAM_CARD_LAYOUT.sideMargin -
  TEAM_CARD_LAYOUT.portraitWidth -
  TEAM_CARD_LAYOUT.gap;

/**
 * **The headline's one size, for every name**: 54px. A name is never sized by
 * its length, here or on the site; each surface picks one size at which the
 * longest nickname we expect, twenty characters ("TheEnderDragonSlayer",
 * 11.7em in Poppins SemiBold), fits its column on a line of its own — here
 * 612px of the 636px column, less the headline's tracking. A name wider than
 * one line wraps at its space, the first name over the nickname, at the same
 * size; a nickname wider than the column alone is cut at its edge.
 */
export const TEAM_CARD_HEADLINE_SIZE = 54;

/**
 * **The voice zones' glow, `.zone-glow` in `src/app/globals.css`, as that rule
 * writes its geometry**: an inset shadow with no offset, this blur and this
 * spread, in rem. The card is drawn by a renderer that takes inline styles
 * only, so it restates the shadow; a unit test reads `globals.css` and fails
 * when the rule stops saying this.
 */
export const ZONE_GLOW_GEOMETRY = { blurRem: 1.25, spreadRem: -0.25 } as const;

/**
 * How much bigger the card draws the glow than a zone does. A zone's frame is
 * a few hundred pixels across; the card's portrait is 400 wide on a 1200 file
 * that previews shrink to half, so the glow is scaled with it to read the same.
 */
const TEAM_CARD_GLOW_SCALE = 2.4;

/** One rem, in the pixels `globals.css` resolves it to. */
const REM_PX = 16;

/** The card portrait's `boxShadow`: the zone glow, scaled, in this colour. */
export function teamCardGlow(color: string): string {
  const px = (rem: number) => rem * REM_PX * TEAM_CARD_GLOW_SCALE;
  return `inset 0 0 ${px(ZONE_GLOW_GEOMETRY.blurRem)}px ${px(ZONE_GLOW_GEOMETRY.spreadRem)}px ${color}`;
}

/** The frame's width, in pixels of the card. */
const TEAM_CARD_FRAME_WIDTH = 6;

/**
 * **The portrait's frame, as the profile page draws it.** A person who picked
 * a colour is edged in it and glows with it (`teamCardGlow`); a person with no
 * pick gets the neutral edge, at the same width, and no glow — the card adds
 * no accent the page does not show. The style the frame's layer takes: the
 * shadow is left out rather than set empty, which the renderer refuses.
 */
export function teamCardFrame(pick: TeamProfile["pick"]): {
  border: string;
  boxShadow?: string;
} {
  const hex = PICKS.find((candidate) => candidate.id === pick)?.hex;
  return hex === undefined
    ? { border: `${TEAM_CARD_FRAME_WIDTH}px solid ${DARK_THEME.border}` }
    : {
        border: `${TEAM_CARD_FRAME_WIDTH}px solid ${hex}`,
        boxShadow: teamCardGlow(hex),
      };
}

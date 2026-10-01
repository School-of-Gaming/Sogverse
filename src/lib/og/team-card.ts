import { createHash } from "node:crypto";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/**
 * The team member's share card: its address, its version, and the numbers the
 * drawing is built from. The route that draws it is
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
 * **Five minutes, public, no stale serving — the photo route's own posture**,
 * not the site cards' year. The card embeds the person's photo, and a public
 * photo's promise is that a profile taken down stops showing its face within
 * five minutes (`src/app/api/team/photos/[userId]/route.ts`). A card cached for
 * a year would carry the face past that under an address anyone can hold, so
 * it inherits the photo's limit. The versioned URL is what keeps the short
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

/** The headline's size when it fits, and the floor it shrinks to. */
export const TEAM_CARD_HEADLINE_MAX = 62;
export const TEAM_CARD_HEADLINE_MIN = 32;

/**
 * The width one character of the headline is budgeted, in ems. Poppins
 * SemiBold's advances average 0.54-0.56em over real names with their quotes
 * (measured from the vendored file), so 0.6 leaves a margin without shrinking
 * a name that would have fitted.
 */
const HEADLINE_EM_PER_CHARACTER = 0.6;

/**
 * **The headline's font size: one line, shrunk to fit, never wrapped.** At
 * 62px when its characters, at 0.6em each, fit the column; otherwise the size
 * at which they do, down to a floor of 32px. A name still wider than the
 * column at the floor — beyond about 33 characters, or a run of the widest
 * glyphs — is cut at the column's edge rather than spilling off the card.
 */
export function teamCardHeadlineSize(headline: string): number {
  const characters = Array.from(headline).length;
  const fitted = Math.floor(
    TEAM_CARD_COLUMN_WIDTH / (characters * HEADLINE_EM_PER_CHARACTER),
  );
  return Math.max(
    TEAM_CARD_HEADLINE_MIN,
    Math.min(TEAM_CARD_HEADLINE_MAX, fitted),
  );
}

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

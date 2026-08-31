import type { SessionReportPhoto } from "../session-photos";

/**
 * Demo photographs for the session-report mail in the admin testing tool.
 *
 * **The same committed art the preview scenes use**, so the mail and the app
 * page are judged on the same pictures — and the same reason it exists at all:
 * the one thing nobody can settle from a unit test is how this grid lands in a
 * real inbox, blocked and unblocked, and a variant nobody can send themselves
 * is a variant nobody checks. The numbers are the files' own pixel sizes,
 * because sizing every box from the stored dimensions is the whole of what a
 * reviewer is here to look at.
 *
 * **Deliberately ordered landscape, portrait, square first**, so the small
 * counts are the interesting ones: three photos show a 16:9 beside a portrait
 * with a square spanning the row underneath, which is the mixed-ratio pairing
 * and the odd-count answer in one render.
 *
 * Fixture data, not copy: never shown outside `/admin/testing`, never
 * translated.
 */
const PHOTO_ART: readonly { path: string; width: number; height: number }[] = [
  { path: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  { path: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
  { path: "/preview-art/session-badge.jpg", width: 1200, height: 1200 },
  { path: "/preview-art/session-arena.jpg", width: 1600, height: 900 },
  { path: "/preview-art/session-parkour.jpg", width: 1440, height: 810 },
];

/**
 * The first `count` demo photos, as absolute URLs — or none at all.
 *
 * **No origin, no photos**, on exactly the terms the shell's brand mark takes:
 * these files are served out of `public/`, so they need the canonical site URL
 * in front of them, and a `localhost` one is unreachable by construction for
 * whoever receives the test send. A *failed* fetch is worse than a blocked one
 * — Gmail's proxy paints its broken-image glyph inside the box — so an
 * unreachable origin yields the mail with no photos section rather than one
 * with five broken wells in it.
 */
export function sessionReportPhotoFixtures(count: number): SessionReportPhoto[] {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return [];
  return PHOTO_ART.slice(0, count).flatMap((art) => {
    try {
      const url = new URL(art.path, siteUrl);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return [];
      return [{ src: url.toString(), width: art.width, height: art.height }];
    } catch {
      return [];
    }
  });
}

/** How many demo photos the testing form offers, and what each one shows. */
export const SESSION_REPORT_PHOTO_COUNTS = ["0", "1", "2", "3", "5"] as const;

export const SESSION_REPORT_PHOTO_COUNT_LABELS: Record<
  (typeof SESSION_REPORT_PHOTO_COUNTS)[number],
  string
> = {
  "0": "None (a report with no photos)",
  "1": "One (a 16:9 screenshot, spanning the row)",
  "2": "Two (a 16:9 beside a portrait)",
  "3": "Three (mixed ratios, the odd one spanning)",
  "5": "Five (the cap, mixed ratios)",
};

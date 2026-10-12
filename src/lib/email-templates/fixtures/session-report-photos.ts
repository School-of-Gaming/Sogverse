import { demoArtUrl, type EmailRenderContext } from "../render-context";
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
 * counts are the interesting ones: three photos show all three shapes, which
 * is the whole of what the box arithmetic has to answer for — a 16:9 filling
 * the column, a portrait held to its 225px cap, and a square at 400.
 *
 * **They are JPEGs because the mail's own photos are.** An SVG would be smaller
 * and easier to author, and no mail client renders one — so demo art in that
 * format would be checking a render the product cannot produce, which is the
 * one thing a fixture must never do.
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
 * The first `count` demo photos, absolute on the render's own origin — a preview
 * and a send alike, so a test send from a dev machine carries `localhost` URLs
 * that load nowhere but that machine.
 */
export function sessionReportPhotoFixtures(
  count: number,
  context: EmailRenderContext | undefined,
): SessionReportPhoto[] {
  return PHOTO_ART.slice(0, count).map((art) => ({
    src: demoArtUrl(art.path, context),
    width: art.width,
    height: art.height,
  }));
}

/** How many demo photos the testing form offers, and what each one shows. */
export const SESSION_REPORT_PHOTO_COUNTS = ["0", "1", "2", "3", "5"] as const;

export const SESSION_REPORT_PHOTO_COUNT_LABELS: Record<
  (typeof SESSION_REPORT_PHOTO_COUNTS)[number],
  string
> = {
  "0": "None (a report with no photos)",
  "1": "One (a 16:9 screenshot, filling the column)",
  "2": "Two (a 16:9 above a portrait)",
  "3": "Three (all three shapes: 16:9, portrait, square)",
  "5": "Five (the cap, mixed ratios)",
};

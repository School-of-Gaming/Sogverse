import { sendableImageOrigin, type EmailRenderContext } from "../render-context";
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
 * The first `count` demo photos, resolved against whichever origin the render's
 * own destination can actually reach.
 *
 * **A send takes the mark's rule exactly**, and there is no fixture exemption
 * from it: a test mail composed on a dev machine carries no photos section at
 * all, because a `localhost` src is unreachable by construction for the inbox it
 * is about to land in, and Gmail's proxy paints a broken-image glyph in every
 * well rather than leaving the wells the design turns on. An `<img>` that will
 * predictably fail is not emitted, whoever the recipient is. Deployed, where the
 * origin is real, a test send carries the pictures like any other.
 *
 * **A preview is the other half, and it is why the distinction exists at all.**
 * The mail drawn in `/admin/testing` is fetched by the browser looking at it, on
 * the machine serving the art, so the loopback origin that is useless in an
 * inbox is the correct one here — and the grid is the thing that page exists to
 * show. Suppressing it there would leave nothing to look at: no pairs, no
 * spanning odd one, no stacking, none of the reserved wells. So the two
 * destinations differ in exactly one way, and it is the way they genuinely
 * differ.
 *
 * **No origin at all is still no photos**, in either destination, and that is an
 * impossibility rather than a judgment: there is no absolute URL to put in a
 * `src`, and a half-built one is the thing this directory never emits.
 */
export function sessionReportPhotoFixtures(
  count: number,
  context: EmailRenderContext,
): SessionReportPhoto[] {
  const origin = context.to === "preview" ? context.origin : sendableImageOrigin();
  if (!origin) return [];
  return PHOTO_ART.slice(0, count).flatMap((art) => {
    try {
      return [
        { src: new URL(art.path, origin).toString(), width: art.width, height: art.height },
      ];
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

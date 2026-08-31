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
 * The first `count` demo photos, resolved against the canonical site origin.
 *
 * **A loopback origin keeps its photos, and that is where this parts company
 * with the shell's brand mark.** The mark drops itself on a `localhost` origin
 * because a *failed* fetch is worse than no fetch — Gmail's proxy paints a
 * broken-image glyph where the badge would be — and dropping it costs nothing,
 * since the lockup underneath already says everything the picture said.
 * Neither half of that reasoning holds here. These photos never reach a mail
 * anyone receives for real: they exist only behind `/admin/testing`, sent to
 * whoever typed their own address into it, and the *grid* is the thing being
 * looked at. Suppressing the section leaves that person nothing to look at at
 * all — no pairs, no spanning odd one, no stacking, and above all none of the
 * reserved wells the whole design turns on. So the section is emitted whatever
 * the origin: deployed, the pictures load; from a dev machine, the mail arrives
 * as the wells-only render this mail is built to survive, which is the render
 * worth checking anyway, and a browser pointed at that same dev server resolves
 * them for real.
 *
 * **No origin at all is still no photos**, and that is a different case rather
 * than a milder one: an unset or malformed `NEXT_PUBLIC_SITE_URL` yields no
 * absolute URL to put in a `src`, and a half-built one is the thing this
 * directory never emits.
 */
export function sessionReportPhotoFixtures(count: number): SessionReportPhoto[] {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return [];
  return PHOTO_ART.slice(0, count).flatMap((art) => {
    try {
      return [
        { src: new URL(art.path, siteUrl).toString(), width: art.width, height: art.height },
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

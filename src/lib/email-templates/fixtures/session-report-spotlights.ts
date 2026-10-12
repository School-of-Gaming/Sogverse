import { sendableImageOrigin, type EmailRenderContext } from "../render-context";
import type {
  SessionReportSpotlight,
  SessionReportSpotlightWithoutPicture,
} from "../session-report";

/**
 * Demo spotlights for the session-report mail in the admin testing tool.
 *
 * Two, newest first as the route orders them, so the rule between one and the
 * next is on screen; the first body carries a link, because a spotlight is the
 * one part of this mail whose links survive. The pictures are committed demo
 * art cut to exactly the 1200×600 every spotlight picture is stored at, so the
 * box a reviewer sees is the box a real one gets.
 *
 * **The pictures take the photo fixtures' origin rule** — the render's own
 * reachable origin, and none at all on a send composed on a dev machine — **but
 * the spotlights do not vanish with them.** With no origin each keeps its title
 * and body, and its picture's slot is the painted reserved box with no `<img>`
 * in it: the title, body and links are what a reviewer needs to check in a real
 * inbox, and the empty box is the honest blocked render, the one a real
 * spotlight arrives as wherever images are off. A `localhost` src is never
 * emitted, since no inbox can reach it.
 *
 * Fixture data, not copy: never shown outside `/admin/testing`, never
 * translated.
 */
const SPOTLIGHT_FIXTURES: readonly {
  title: string;
  body: string;
  art: { path: string; width: number; height: number };
}[] = [
  {
    title: "Autumn camps are open",
    body: "Three days of building, racing and friends during the autumn break. **Places are limited**, so [have a look at the camps](/shop) before they fill up.",
    art: { path: "/preview-art/spotlight-arena.jpg", width: 1200, height: 600 },
  },
  {
    title: "A new Roblox club this term",
    body: "Our first Roblox club starts next month.\n\n- One session a week\n- A Gedu in every session",
    art: { path: "/preview-art/spotlight-parkour.jpg", width: 1200, height: 600 },
  },
];

/** Whether the testing form attaches the demo spotlights. */
export const SESSION_REPORT_SPOTLIGHT_CHOICES = ["two", "none"] as const;

export const SESSION_REPORT_SPOTLIGHT_LABELS: Record<
  (typeof SESSION_REPORT_SPOTLIGHT_CHOICES)[number],
  string
> = {
  two: "Two (one with a link)",
  none: "None (no spotlight is enabled)",
};

export function sessionReportSpotlightFixtures(
  choice: (typeof SESSION_REPORT_SPOTLIGHT_CHOICES)[number],
  context: EmailRenderContext,
): (SessionReportSpotlight | SessionReportSpotlightWithoutPicture)[] {
  if (choice === "none") return [];
  const origin = context.to === "preview" ? context.origin : sendableImageOrigin();
  return SPOTLIGHT_FIXTURES.map(({ title, body, art }) => {
    const url = origin ? artUrl(art.path, origin) : null;
    return url === null
      ? { title, body, image: { url: null, width: art.width, height: art.height } }
      : { title, body, image: { url, width: art.width, height: art.height } };
  });
}

/** The art's absolute URL, or none when the origin cannot make one. */
function artUrl(path: string, origin: string): string | null {
  try {
    return new URL(path, origin).toString();
  } catch {
    return null;
  }
}

import { demoArtUrl, type EmailRenderContext } from "../render-context";
import type { SessionReportSpotlight } from "../session-report";

/**
 * Demo spotlights for the session-report mail in the admin testing tool.
 *
 * Two, newest first as the route orders them, so the rule between one and the
 * next is on screen; the first body carries a link, because a spotlight is the
 * one part of this mail whose links survive. The pictures are committed demo
 * art cut to exactly the 1200×600 every spotlight picture is stored at, so the
 * box a reviewer sees is the box a real one gets. They resolve against the
 * render's own origin, as the photo fixtures do.
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
  context: EmailRenderContext | undefined,
): SessionReportSpotlight[] {
  if (choice === "none") return [];
  return SPOTLIGHT_FIXTURES.map(({ title, body, art }) => ({
    title,
    body,
    image: {
      url: demoArtUrl(art.path, context),
      width: art.width,
      height: art.height,
    },
  }));
}

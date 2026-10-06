/**
 * The two numbers that bound a link-preview image, kept apart from the encoder
 * that enforces them so a URL builder can read them without importing sharp or
 * a `server-only` module. The encoder (`encode-within-budget.server.ts`) is
 * what makes them true; `og:image` metadata states the dimensions they imply.
 */

/**
 * The most a preview image may weigh. WhatsApp drops preview images over
 * ~300 KB; the margin below that absorbs the difference between how we count a
 * kilobyte and how it does, and whatever headers ride along.
 */
export const PREVIEW_IMAGE_BUDGET_BYTES = 250 * 1024;

/**
 * The widest a preview image is served. 1200 is the width every platform's
 * card guidance designs to; anything wider is bytes the crawler scales away.
 */
export const PREVIEW_IMAGE_MAX_WIDTH = 1200;

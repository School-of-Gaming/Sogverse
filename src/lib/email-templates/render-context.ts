/**
 * The origin a render resolves the testing tool's demo art against — the
 * committed pictures under `public/preview-art/` that the session report's
 * fixtures point at.
 *
 * **It is the render's own origin, stated by the caller and never sniffed.** The
 * admin preview names its browser's origin, which is the server actually serving
 * the art whatever port it is on; the test-send route names the request's,
 * through `getOrigin()`. A send and a preview therefore carry the same URLs, and
 * a test send from a dev machine carries `localhost` ones: an inbox cannot fetch
 * them, so its pictures fail to load there and load from a deployed site.
 *
 * Only the fixtures read it. A builder never composes a URL (see `CLAUDE.md`),
 * so a render that asks for no demo art needs no context at all.
 */
export interface EmailRenderContext {
  readonly origin: string;
}

/**
 * The origin the shell's brand mark may be fetched from, or `null` when there
 * isn't one.
 *
 * **No origin, no image — never a half-built `src`.** An unset or malformed
 * `NEXT_PUBLIC_SITE_URL` yields nothing rather than an `undefined/email/…` that
 * resolves to a broken box, and a **loopback** origin takes the same branch: it
 * is well-formed and unreachable, which is worse, because a failed fetch paints
 * a broken-image glyph inside the box the layout reserved while an absent one
 * paints the well the design is built around.
 *
 * The origin is the canonical `NEXT_PUBLIC_SITE_URL` rather than a per-request
 * one — see `layout.ts` for why an image `src` and a *link* get their origins
 * from different places. The Discord `/sub` messages ask the same question of
 * their header logo, whose fetcher is Discord rather than a mail client, and
 * read the answer from here, so the mark and the logo cannot disagree about it.
 */
export function sendableImageOrigin(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return null;
  try {
    const { hostname } = new URL(siteUrl);
    // The two names a dev machine serves itself under. Kept literal and kept
    // together: one list, so the mark and the Discord logo cannot disagree
    // about what counts as unreachable.
    if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  } catch {
    return null;
  }
  return siteUrl;
}

/**
 * A demo picture's absolute URL on the render's origin.
 *
 * **Throws without a context**: a render that asks for demo art has to say
 * where it is being drawn, and there is no absolute URL to build otherwise. Both
 * real callers state one; a render that asks for no art never gets here.
 */
export function demoArtUrl(path: string, context: EmailRenderContext | undefined): string {
  if (!context) {
    throw new Error(`Demo art ${path} needs the render's origin, and this render stated none.`);
  }
  return new URL(path, context.origin).toString();
}

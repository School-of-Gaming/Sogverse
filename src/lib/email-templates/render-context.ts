/**
 * Where a rendered mail is going — and therefore who is going to fetch the
 * images in it.
 *
 * **The two destinations are not the same document with a different audience.**
 * A send leaves the building: a stranger's mail client fetches every `src` from
 * wherever that client happens to be, and Gmail and Outlook proxy the fetch
 * through their own servers besides. A preview never leaves: the browser that
 * asked for it draws it, on the machine that served the page. So an origin only
 * that one machine can reach — `localhost` — is unreachable by construction for
 * a recipient and perfectly reachable for a previewer, and the same URL is a
 * broken-image glyph in one and a photograph in the other.
 *
 * **The context is stated by the caller, never sniffed.** A render has no way to
 * find out where its output is about to go, and guessing from the environment is
 * how a production send starts depending on a dev-machine accident. The send
 * route says `send`; the admin preview says `preview` and names the origin its
 * own browser will resolve relative art against, which is that browser's, not
 * whatever `NEXT_PUBLIC_SITE_URL` happens to hold on the machine serving it.
 *
 * **`send` is the default**, so a caller who has not thought about it renders
 * the mail that is safe to put in a stranger's inbox. The rule this exists to
 * serve is the one below: an emailed `<img>` that will predictably fail must not
 * be emitted at all.
 */
export type EmailRenderContext =
  | { readonly to: "send" }
  /** `origin` is the previewing browser's own — where its `<img>` fetches land. */
  | { readonly to: "preview"; readonly origin: string };

/**
 * The origin an image in a *sent* mail may be fetched from, or `null` when
 * there isn't one.
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
 * from different places. It lives here rather than beside either caller because
 * there are two of them (the shell's brand mark and the testing tool's demo
 * photographs) and one rule: both are files served out of `public/`, both need
 * an absolute URL in front of them, and both would rather be absent than broken.
 */
export function sendableImageOrigin(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return null;
  try {
    const { hostname } = new URL(siteUrl);
    // The two names a dev machine serves itself under. Kept literal and kept
    // together: one list, so the mark and the photographs cannot disagree about
    // what counts as unreachable.
    if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  } catch {
    return null;
  }
  return siteUrl;
}

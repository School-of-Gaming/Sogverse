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

/**
 * A file a rendered mail carries with it.
 *
 * **The name is not decoration.** The transactional provider has no media-type
 * field and infers one from the extension, so the name is what decides whether
 * a calendar arrives as an invitation a client can act on or as a file to
 * download — which is the whole difference between a schedule landing in
 * somebody's calendar and a schedule they have to add by hand.
 *
 * **`text` is the preview's half and never leaves the building.** Only the
 * base64 content is sent; `text` is the same bytes decoded, for the one surface
 * that has to show what was composed rather than what it looks like. It is
 * present only where the attachment genuinely is text — there is nothing useful
 * to put on screen for a picture or a PDF — which is why it is optional rather
 * than derived.
 */
export interface RenderedAttachment {
  name: string;
  contentBase64: string;
  /** The decoded content, for a preview. Text attachments only. */
  text?: string;
}

/**
 * UTF-8 text as base64, in a form both ends of the registry can run.
 *
 * The registry is imported by an admin *page* as well as by the send route, so
 * anything in this path has to work in a browser bundle — which rules out
 * `Buffer`. The two-step shape is the point: `btoa` alone corrupts every
 * character above U+00FF, so the string is encoded to bytes first and the
 * base64 step then only ever sees byte values.
 */
export function textAttachment(name: string, content: string): RenderedAttachment {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { name, contentBase64: btoa(binary), text: content };
}

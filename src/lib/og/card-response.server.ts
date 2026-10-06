import "server-only";
import type { ImageResponse } from "next/og";
import { encodeWithinBudget } from "@/lib/images/encode-within-budget.server";

/**
 * **The one way a drawn card leaves the server: through the preview budget.**
 * Every Open Graph route that draws a card with `ImageResponse` returns it
 * through here rather than returning the `ImageResponse` itself.
 *
 * The renderer only produces PNG. That is the right format for a card that is
 * flat colour and text — small and crisp — and the wrong one for a card that
 * carries a photograph: PNG stores the photo losslessly, so the card is large
 * whatever quality the upload was saved at, and a team card came out at
 * ~460 KB. The budget is not ours to choose either: it is what the preview
 * consumers will show, and WhatsApp drops any preview image over roughly
 * 300 KB without a word — the link arrives with no picture, and nothing on our
 * side hears about it.
 *
 * So the rendered PNG goes through `encodeWithinBudget`, which keeps a card
 * that fits as the PNG it was drawn as, byte for byte, and re-encodes one that
 * does not as a JPEG under budget. A card that nothing can fit throws
 * `ImageOverBudgetError`, which is deliberately not caught here: it is a design
 * defect the card's budget test catches before it ships, and at runtime it
 * must surface as an error rather than as an image WhatsApp silently drops.
 *
 * The route passes its own `Cache-Control`, because the cards differ there:
 * the site cards are immutable for a release, a team card is drawn fresh
 * every five minutes.
 */
export async function ogCardResponse(
  card: ImageResponse,
  init: { cacheControl: string },
): Promise<Response> {
  const rendered = Buffer.from(await card.arrayBuffer());
  const { bytes, contentType } = await encodeWithinBudget(rendered);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": init.cacheControl,
    },
  });
}

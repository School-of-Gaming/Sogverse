/**
 * The font files every Open Graph card is set in, and the one place they are
 * named.
 *
 * satori has no access to the app's fonts — `next/font` produces CSS, and an
 * `ImageResponse` needs the actual bytes — so each card fetches the two weights
 * it draws and hands them over as buffers. The fetch happens at build time,
 * once per card, which is why a plain `fetch` of a Google Fonts URL is
 * acceptable here and would not be anywhere else.
 *
 * **The name is the library's and the files are the consumer's.** Which family
 * a card draws is a decision @sog/ui makes and Sogverse takes whole, so the
 * family arrives as `OG_FONT_FAMILY`, derived from the app face in
 * `src/lib/constants/typography.ts` and re-exported here so a card imports its
 * face and its buffers from one module. What stays Sogverse's is the fetching:
 * a hashed gstatic URL is a fact about one cut of one file rather than about
 * the brand, and the library names faces without ever shipping or fetching one.
 * If the app face moves, the name below follows it and these URLs stop matching
 * it — the build fetches a family the cards no longer ask for and satori falls
 * back — which is why the URLs are pinned here beside a comment saying so
 * rather than derived from a name they cannot be derived from.
 *
 * Both cards use the same two weights, so both used to carry the same pair of
 * hashed gstatic URLs copied side by side. A hashed URL is exactly the kind of
 * string that cannot be eyeballed for equality, and Google's file names change
 * when a face is re-cut, so the copies could only rot apart into two cards set
 * in two different vintages of the face with nothing to show for it in a diff.
 * One module, one pair of URLs.
 *
 * Weight 600 comes first in the array because satori matches on the first
 * entry that fits; the order is the one both cards shipped with.
 */
import type { ImageResponse } from "next/og";

import { OG_FONT_FAMILY } from "@/lib/constants/typography";

type ImageResponseOptions = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>;
type OgFonts = NonNullable<ImageResponseOptions["fonts"]>;

/**
 * The family satori is told to draw in — the string each card passes as its
 * `fontFamily`, re-exported so a card names the face by importing it beside the
 * buffers that carry it rather than by retyping it. The name itself is derived
 * from @sog/ui's app face; nothing here spells a family.
 */
export { OG_FONT_FAMILY };

// The app face is a static family on Google Fonts, so each weight is its own
// file, and these two URLs are the cut of it the cards draw.
// These are the full TTFs (not a subset), which is what satori needs: it draws
// Finnish, Swedish and French copy, and a latin-only cut would drop glyphs
// straight out of the PNG with nothing to fall back to.
const POPPINS_REGULAR_URL =
  "https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJA.ttf";
const POPPINS_SEMIBOLD_URL =
  "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6V1s.ttf";

/**
 * The app face at 400 and 600, fetched in parallel and shaped as the `fonts`
 * option an `ImageResponse` takes. Every card in this codebase needs exactly
 * these two
 * — the site-wide card and the programme card both set their headline at 600 and
 * everything under it at 400 — so this returns the pair rather than taking a
 * list of weights nobody would ever vary.
 */
export async function ogFonts(): Promise<OgFonts> {
  const [regular, semiBold] = await Promise.all([
    fetch(POPPINS_REGULAR_URL).then((res) => res.arrayBuffer()),
    fetch(POPPINS_SEMIBOLD_URL).then((res) => res.arrayBuffer()),
  ]);

  return [
    { name: OG_FONT_FAMILY, data: semiBold, style: "normal", weight: 600 },
    { name: OG_FONT_FAMILY, data: regular, style: "normal", weight: 400 },
  ];
}

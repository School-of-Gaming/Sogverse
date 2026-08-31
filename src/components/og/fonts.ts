/**
 * The typeface every Open Graph card is set in, and the one place its files are
 * named.
 *
 * satori has no access to the app's fonts — `next/font` produces CSS, and an
 * `ImageResponse` needs the actual bytes — so each card fetches the two weights
 * it draws and hands them over as buffers. The fetch happens at build time,
 * once per card, which is why a plain `fetch` of a Google Fonts URL is
 * acceptable here and would not be anywhere else. This is the one place in the
 * app that names a font family literally: everywhere else the face is reached
 * through `--font-sans`, which a PNG renderer cannot read.
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

type ImageResponseOptions = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>;
type OgFonts = NonNullable<ImageResponseOptions["fonts"]>;

/**
 * The family satori is told to draw in — the string each card passes as its
 * `fontFamily`, exported so a card names the face by importing it rather than
 * by retyping it beside the buffers that define it.
 */
export const OG_FONT_FAMILY = "Poppins";

// Poppins is a static family on Google Fonts, so each weight is its own file.
// These are the full TTFs (not a subset), which is what satori needs: it draws
// Finnish, Swedish and French copy, and a latin-only cut would drop glyphs
// straight out of the PNG with nothing to fall back to.
const POPPINS_REGULAR_URL =
  "https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJA.ttf";
const POPPINS_SEMIBOLD_URL =
  "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6V1s.ttf";

/**
 * Poppins at 400 and 600, fetched in parallel and shaped as the `fonts` option
 * an `ImageResponse` takes. Every card in this codebase needs exactly these two
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

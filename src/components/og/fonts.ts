/**
 * The typeface every Open Graph card is set in, and the one place its files are
 * named.
 *
 * satori has no access to the app's fonts — `next/font` produces CSS, and an
 * `ImageResponse` needs the actual bytes — so each card fetches the two weights
 * it draws and hands them over as buffers. The fetch happens at build time,
 * once per card, which is why a plain `fetch` of a Google Fonts URL is
 * acceptable here and would not be anywhere else.
 *
 * Both cards use the same two weights, so both used to carry the same pair of
 * hashed gstatic URLs copied side by side. A hashed URL is exactly the kind of
 * string that cannot be eyeballed for equality, and Google's file names change
 * when a face is re-cut, so the copies could only rot apart into two cards set
 * in two different vintages of Inter with nothing to show for it in a diff.
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

const INTER_REGULAR_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf";
const INTER_SEMIBOLD_URL =
  "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf";

/**
 * Inter at 400 and 600, fetched in parallel and shaped as the `fonts` option an
 * `ImageResponse` takes. Every card in this codebase needs exactly these two —
 * the site-wide card and the programme card both set their headline at 600 and
 * everything under it at 400 — so this returns the pair rather than taking a
 * list of weights nobody would ever vary.
 */
export async function interFonts(): Promise<OgFonts> {
  const [interRegular, interSemiBold] = await Promise.all([
    fetch(INTER_REGULAR_URL).then((res) => res.arrayBuffer()),
    fetch(INTER_SEMIBOLD_URL).then((res) => res.arrayBuffer()),
  ]);

  return [
    { name: "Inter", data: interSemiBold, style: "normal", weight: 600 },
    { name: "Inter", data: interRegular, style: "normal", weight: 400 },
  ];
}

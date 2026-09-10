/**
 * The font files every Open Graph card is set in, and the one place they are
 * named.
 *
 * satori has no access to the app's fonts — `next/font` produces CSS, and an
 * `ImageResponse` needs the actual bytes — so each card loads the two weights it
 * draws and hands them over as buffers.
 *
 * **The files are vendored, not fetched.** They used to be pulled from a hashed
 * gstatic URL, which was acceptable only while the cards were file-convention
 * images baked at build time. The cards are request-time route handlers now, so
 * a fetch to a third party would sit inside the request a crawler is waiting on:
 * whenever that third party hiccups, the social card is a blank or a 500, on the
 * one surface nobody would notice was broken. Two files of ~150 KB in the repo
 * buy that away. They are the full TTFs (not a latin subset), which is what
 * satori needs: it draws Finnish, Swedish and French copy, and a latin-only cut
 * would drop glyphs straight out of the PNG with nothing to fall back to. The
 * licence they ship under is beside them in `src/assets/fonts/OFL.txt`.
 *
 * **The name is the library's and the files are the consumer's.** Which family
 * a card draws is a decision @sog/ui makes and Sogverse takes whole, so the
 * family arrives as `OG_FONT_FAMILY`, derived from the app face in
 * `src/lib/constants/typography.ts` and re-exported here so a card imports its
 * face and its buffers from one module. What stays Sogverse's is the loading. If
 * the app face ever moves, the files below stop matching the name — the cards
 * would be set in a family they no longer ask for — which is why they are pinned
 * here beside a comment saying so rather than derived from a name they cannot be
 * derived from.
 *
 * Weight 600 comes first in the array because satori matches on the first
 * entry that fits; the order is the one both cards shipped with.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

// The app face is a static family, so each weight is its own file. Read from
// the repo through `process.cwd()`, the same shape the docs corpus is read
// with; `next.config.ts` names this directory in `outputFileTracingIncludes` so
// the two files are deployed beside the handlers that read them.
const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");

/**
 * Read once per server instance. A card is a cached response, so this is not on
 * a hot path — but a route handler can be invoked repeatedly on one warm
 * instance and re-reading 300 KB from disk each time buys nothing.
 */
let cached: Promise<OgFonts> | null = null;

async function loadFonts(): Promise<OgFonts> {
  const [regular, semiBold] = await Promise.all([
    readFile(join(FONT_DIR, "poppins-regular.ttf")),
    readFile(join(FONT_DIR, "poppins-semibold.ttf")),
  ]);

  return [
    { name: OG_FONT_FAMILY, data: semiBold, style: "normal", weight: 600 },
    { name: OG_FONT_FAMILY, data: regular, style: "normal", weight: 400 },
  ];
}

/**
 * The app face at 400 and 600, shaped as the `fonts` option an `ImageResponse`
 * takes. Every card in this codebase needs exactly these two — the site-wide
 * card and the programme card both set their headline at 600 and everything
 * under it at 400 — so this returns the pair rather than taking a list of
 * weights nobody would ever vary.
 */
export async function ogFonts(): Promise<OgFonts> {
  cached ??= loadFonts();
  return cached;
}

/* eslint-disable i18next/no-literal-string -- OG image is rendered to a PNG by next/og at build time; the text is baked into the image, not a runtime UI string. It is also French for every locale — see `metadata-copy.ts` next door for why the programme's card does not follow the viewer's locale */
import { ImageResponse } from "next/og";
import { DARK_THEME, BRAND, GRADIENT } from "@/lib/constants/colors";
import { LynxEducateMark, RobloxWordmark, SogMark } from "@/components/og/marks";
import { ogFonts, OG_FONT_FAMILY } from "@/components/og/fonts";
import { ROBLOX_OG_TITLE, ROBLOX_TRADEMARK_NOTICE } from "./metadata-copy";

export const alt = ROBLOX_OG_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social card for the Roblox game-design programme.
 *
 * It is a three-mark card because the programme is a three-way thing, and the
 * two words for those relationships are not interchangeable: School of Gaming
 * *partners with* Lynx Educate and *collaborates with* Roblox, which is why the
 * label above the lockup reads "Une collaboration entre" and nothing on this
 * card says "partenariat". See the partner-brand rules in the root CLAUDE.md.
 *
 * Roblox's own constraints shape the bottom half. Their guidelines put a 20px
 * floor under the wordmark, and the floor is about the size it is *seen* at, not
 * the size it is drawn at — a feed thumbnail routinely scales a 1200px card down
 * past half. So the mark is 54px here, which still clears 20px at the ~500px
 * width these cards are usually shown at, and the other two are sized up around
 * it. They also forbid recolouring or restyling the mark — it is their white
 * colourway, unmodified, and the accent in the headline falls on what the reader
 * would make, never on a partner's name. They require clearspace nothing
 * advances into: the gutters either side, and the notice held down at the bottom
 * padding line. They forbid placing it over a busy background, and the two-tone
 * wash has faded to flat ground long before it reaches the lockup. And they
 * require a trademark notice wherever the mark appears — the last line, and it
 * is the same string the programme's pages render, not a retyping of it: it
 * comes from `metadata-copy.ts`, which is pinned to `messages/fr.json` by a
 * unit test.
 *
 * Meeting all of that is still not permission. Roblox signs off per placement,
 * and this card is a new placement.
 */
export default async function Image() {
  const fonts = await ogFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: DARK_THEME.bg,
          backgroundImage: `linear-gradient(to bottom, transparent 0%, ${DARK_THEME.bg} 62%), linear-gradient(to right, ${GRADIENT.primaryGlow}, ${DARK_THEME.bg} 50%, ${GRADIENT.secondaryGlow})`,
          padding: "48px 80px",
        }}
      >
        {/* The trademark notice is a footer, so it is pinned to the bottom
            padding line and everything else takes the space above it — which is
            also what opens the gap under the Roblox wordmark that its clearspace
            rule wants. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "18px",
              fontFamily: OG_FONT_FAMILY,
              fontSize: "72px",
              fontWeight: 600,
              letterSpacing: "-1.5px",
              color: DARK_THEME.foreground,
            }}
          >
            <span>Crée</span>
            <span style={{ color: BRAND.primary }}>ton propre jeu</span>
            <span>Roblox</span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "20px",
              fontFamily: OG_FONT_FAMILY,
              fontSize: "32px",
              fontWeight: 400,
              color: DARK_THEME.mutedFg,
            }}
          >
            Programme gratuit, animé par de vrais Game Educators
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "58px",
              fontFamily: OG_FONT_FAMILY,
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: DARK_THEME.mutedFg,
            }}
          >
            Une collaboration entre
          </div>

          {/* Heights differ per mark on purpose: the aspect ratios span 1.8:1 to
              5.4:1, so equal heights would make our squat badge tower over the
              two wordmarks instead of reading as their equal. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "64px",
              marginTop: "30px",
            }}
          >
            <SogMark height={118} />
            <LynxEducateMark height={68} />
            <RobloxWordmark height={54} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "1000px",
            fontFamily: OG_FONT_FAMILY,
            fontSize: "15px",
            fontWeight: 400,
            lineHeight: 1.5,
            textAlign: "center",
            color: DARK_THEME.mutedFg,
          }}
        >
          {ROBLOX_TRADEMARK_NOTICE}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}

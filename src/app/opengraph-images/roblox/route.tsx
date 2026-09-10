import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { DARK_THEME, BRAND } from "@/lib/constants/colors";
import { LynxEducateMark, RobloxWordmark, SogMark } from "@/components/og/marks";
import { ogFonts, OG_FONT_FAMILY } from "@/components/og/fonts";
import {
  cardLocaleOf,
  OG_CARD_CACHE_CONTROL,
  OG_CARD_SIZE,
} from "@/lib/og/cards";

/**
 * The social card for the Roblox game-design programme.
 *
 * It is a three-mark card because the programme is a three-way thing, and the
 * two words for those relationships are not interchangeable: School of Gaming
 * *partners with* Lynx Educate and *collaborates with* Roblox, which is why the
 * label above the lockup says a collaboration and nothing on this card says
 * "partnership". See the partner-brand rules in `src/CLAUDE.md`.
 *
 * **The card follows the URL's locale now.** It was French for every locale on
 * purpose — the programme is shared into French channels and the URL could not
 * carry a locale, so the card was composed for the recipient the link was
 * expected to reach. Locale-prefixed routing retires that reasoning: `/fr/roblox`
 * pins French for whoever it is sent to, so the card reads the catalog like
 * every other surface, with today's French wording as the `fr` values. The
 * trademark notice is read from the very key the programme's pages render, at
 * the card's locale — which is what let the pinned French literal and the drift
 * test that guarded it be deleted outright.
 *
 * Roblox's own constraints shape the bottom half. Their guidelines put a 20px
 * floor under the wordmark, and the floor is about the size it is *seen* at, not
 * the size it is drawn at — a feed thumbnail routinely scales a 1200px card down
 * past half. So the mark is 54px here, which still clears 20px at the ~500px
 * width these cards are usually shown at, and the other two are sized up around
 * it. They also forbid recolouring or restyling the mark — it is their white
 * colourway, unmodified, and the accent in the headline falls on what the reader
 * would make, never on a partner's name, which is what the three-part headline
 * below is for: each locale places its own accent and keeps the Roblox name
 * outside it. They require clearspace nothing advances into: the gutters either
 * side, and the notice held down at the bottom padding line. They forbid placing
 * it over a busy background, and the card is the flat ground throughout — the
 * violet rule sits under the headline, well clear of the lockup. And they
 * require a trademark notice wherever the mark appears — the last line.
 *
 * Meeting all of that is still not permission. Roblox signs off per placement,
 * and this card is a new placement.
 */
export async function GET(request: Request) {
  const locale = cardLocaleOf(request);
  const [t, tLegal, fonts] = await Promise.all([
    getTranslations({ locale, namespace: "metadata.og.roblox" }),
    getTranslations({ locale, namespace: "roblox.legal" }),
    ogFonts(),
  ]);

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
          // The flat ground, as the home card is. What colours this card is the
          // amber in the headline and the violet rule under it, both at their
          // authored values; the pre-blended two-tone wash that used to open it
          // was the brand pair at an alpha step wearing a solid's clothes.
          backgroundColor: DARK_THEME.bg,
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
          {/* The headline and its rule as one shrink-to-fit column, so
              `alignSelf: stretch` gives the rule the headline's own measure
              with nothing measured at render time. The rule is the home page
              hero's construct, and it sits in the middle of the card where no
              preview crop reaches it. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Three keys, not one sentence: the gap draws the word spaces, and
                the middle one is the accent. A locale writes the opening, the
                thing the reader makes, and the part that names Roblox, in that
                order — which is the constraint the guidelines put on where the
                accent may fall, expressed as the shape of the copy. */}
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
              <span>{t("headline")}</span>
              <span style={{ color: BRAND.act }}>{t("headlineAccent")}</span>
              <span>{t("headlineTail")}</span>
            </div>
            <div
              style={{
                display: "flex",
                alignSelf: "stretch",
                height: "10px",
                marginTop: "28px",
                borderRadius: "999px",
                backgroundColor: BRAND.world,
              }}
            />
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
            {t("subline")}
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
            {t("collaboration")}
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
          {tLegal("roblox")}
        </div>
      </div>
    ),
    {
      ...OG_CARD_SIZE,
      fonts,
      headers: { "Cache-Control": OG_CARD_CACHE_CONTROL },
    },
  );
}

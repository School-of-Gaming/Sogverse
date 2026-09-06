/* eslint-disable i18next/no-literal-string -- OG image is rendered to a PNG by next/og at build time; the text is baked into the image, not a runtime UI string */
import { ImageResponse } from "next/og";
import { DARK_THEME, BRAND } from "@/lib/constants/colors";
import { BRAND_LOCKUP } from "@/lib/constants";
import { SogMark } from "@/components/og/marks";
import { ogFonts, OG_FONT_FAMILY } from "@/components/og/fonts";

export const alt = BRAND_LOCKUP;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The site-wide social card: the brand mark, the tagline, and one line saying
 * what we actually run.
 *
 * An OG image is the coldest contact surface we have — it is met by someone who
 * has never heard of us, at thumbnail size, beside other people's links — so it
 * leads with the name a parent could have been told by a school or another
 * parent, and the mark does that work on its own. Nothing here says "Sogverse":
 * that is the platform, and a stranger has no account to log into yet.
 *
 * The three elements are in the order a stranger needs them — who we are, what
 * we promise, what we actually run — and there is no fourth. Everything below
 * the mark has to survive being shrunk to roughly 500px wide, which is what sets
 * the two type sizes; and the card carries no button, no fake screenshot and no
 * number, because the click has to still be worth having once they arrive.
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
          justifyContent: "center",
          // The dark ground the whole product sits on, and nothing else. A
          // two-tone wash used to warm one corner and cool the other, built
          // from the pair pre-blended against this ground because a renderer
          // with no alpha needs the flat colour — which is precisely what made
          // it a brand colour at an alpha step wearing a solid's clothes. The
          // card's colour is the violet rule under the headline and the amber
          // half of the headline itself, both at their authored values.
          backgroundColor: DARK_THEME.bg,
          padding: "48px 80px",
        }}
      >
        {/* The mark's height is what the rest of the card is budgeted against:
            630px less the 48px padding top and bottom leaves 534px, and the
            two-line statement, its rule and its sub-line spend 244 of it (36
            above the statement, 112 for its two lines at 50/1.12, 28 and 10 for
            the rule, then 20 and 38 for the sub-line). 270 keeps the column
            inside that budget with room to spare — a taller mark pushes the
            sub-line's descenders onto the bottom edge, which reads as a crop
            rather than as a card. It stood at 310 while the card had no rule. */}
        <SogMark height={270} />

        {/* The vision statement, drawn the way the styled home hero draws it:
            the canonical capitalization, broken across lines, and no full stop
            — a graphic rather than a sentence. Two lines, not the hero's four,
            because this one has to stay readable at thumbnail width. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 1.12,
            marginTop: "36px",
            fontFamily: OG_FONT_FAMILY,
            fontSize: "50px",
            fontWeight: 600,
            letterSpacing: "-1px",
            color: DARK_THEME.foreground,
          }}
        >
          <span>Where Screen Time Becomes</span>
          {/* The payoff half in the mark's own yellow — the only accent below
              the badge, so the eye finishes the line. */}
          <span style={{ color: BRAND.act }}>Quality Time</span>
          {/* The page's own hero construct, so a share and the page it lands on
              say one thing. `alignSelf: stretch` rather than a percentage: this
              column is shrink-to-fit around the wider of the two lines, so
              stretching the rule across it is the headline's measure with
              nothing measured at render time. It sits in the middle of the
              card, which is what makes it survive every preview crop — X trims
              15px off the top and bottom of a 1200×630 file, and rounded
              previews eat the corners, so a band on an edge is the first thing
              to go. */}
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
          Clubs, camps and events led by professional Game Educators
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}

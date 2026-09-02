/* eslint-disable i18next/no-literal-string -- OG image is rendered to a PNG by next/og at build time; the text is baked into the image, not a runtime UI string */
import { ImageResponse } from "next/og";
import { DARK_THEME, BRAND, GRADIENT } from "@/lib/constants/colors";
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
          // The dark ground the whole product sits on, warmed at one corner and
          // cooled at the other by the same two-tone wash the transactional
          // emails open with — the pre-blended stops from the colour constants,
          // so it stays a flat, banding-free fill once it is a PNG. It fades out
          // well above the type, which leaves the tagline on plain background.
          backgroundColor: DARK_THEME.bg,
          backgroundImage: `linear-gradient(to bottom, transparent 0%, ${DARK_THEME.bg} 78%), linear-gradient(to right, ${GRADIENT.primaryGlow}, ${DARK_THEME.bg} 50%, ${GRADIENT.secondaryGlow})`,
          padding: "48px 80px",
        }}
      >
        {/* The mark's height is what the rest of the card is budgeted against:
            630px less the 48px padding top and bottom leaves 534px, and the
            two-line statement plus its sub-line spend 204 of it. 310 keeps the
            column inside that budget with room to spare — a taller mark pushes
            the sub-line's descenders onto the bottom edge, which reads as a
            crop rather than as a card. */}
        <SogMark height={310} />

        {/* The vision statement in its logged display treatment: the canonical
            capitalization, broken across lines, and no full stop — a graphic
            rather than a sentence. Two lines, not the hero's four, because this
            one has to stay readable at thumbnail width.

            Set on the pinned H1 recipe — Poppins 600 at 1.1 with no tracking.
            The negative letter-spacing this line used to carry was the
            pre-pass `tracking-tight` idiom, which the design pass dropped from
            display-scale headings everywhere (H2 kept it, H1 did not).

            **The colour split is where the card parts from the hero, and the
            parting is measured rather than accidental.** The hero sets "Screen
            Time" amber and "Quality Time" violet — the brand's two leads. On
            this ground violet is 2.91:1, under even the 3:1 large-text floor,
            and unlike wit it has no soft variant to fall back on. A 56px
            headline on a page a reader can lean into carries that; a card met
            at roughly 500px wide in a feed does not, and the payoff words are
            the last place on the card to spend legibility. So violet stays at
            its authored value in the two-tone wash above and the type takes the
            other lead. This is not a drift to "restore" — putting violet back
            on these words would ship the most important line of the coldest
            surface we have below the contrast floor. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 1.1,
            marginTop: "36px",
            fontFamily: OG_FONT_FAMILY,
            fontSize: "50px",
            fontWeight: 600,
            color: DARK_THEME.foreground,
          }}
        >
          {/* Neutral, and deliberately so: the pass ruled that an emphasis tier
              needing no meaning is better served by a non-brand colour than by
              borrowing a hue already committed to one. */}
          <span>Where Screen Time Becomes</span>
          {/* The payoff half in the mark's own yellow — the only accent below
              the badge, so the eye finishes the line. */}
          <span style={{ color: BRAND.primary }}>Quality Time</span>
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

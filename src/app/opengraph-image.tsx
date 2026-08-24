/* eslint-disable i18next/no-literal-string -- OG image is rendered to a PNG by next/og at build time; the text is baked into the image, not a runtime UI string */
import { ImageResponse } from "next/og";
import { DARK_THEME, BRAND, GRADIENT } from "@/lib/constants/colors";
import { BRAND_LOCKUP } from "@/lib/constants";
import { SogMark } from "@/components/og/marks";

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
  const [interRegular, interSemiBold] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf"
    ).then((res) => res.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf"
    ).then((res) => res.arrayBuffer()),
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
        <SogMark height={350} />

        <div
          style={{
            display: "flex",
            gap: "14px",
            marginTop: "44px",
            fontFamily: "Inter",
            fontSize: "50px",
            fontWeight: 600,
            letterSpacing: "-1px",
            color: DARK_THEME.foreground,
          }}
        >
          <span>Where screen time becomes</span>
          {/* The payoff half of the tagline in the mark's own yellow — the only
              accent below the badge, so the eye finishes the line. */}
          <span style={{ color: BRAND.primary }}>quality time</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "20px",
            fontFamily: "Inter",
            fontSize: "32px",
            fontWeight: 400,
            color: DARK_THEME.mutedFg,
          }}
        >
          Clubs, camps and events led by professional Game Educators
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Inter",
          data: interSemiBold,
          style: "normal",
          weight: 600,
        },
        {
          name: "Inter",
          data: interRegular,
          style: "normal",
          weight: 400,
        },
      ],
    }
  );
}

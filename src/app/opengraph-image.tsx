import { ImageResponse } from "next/og";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";

export const alt = "Sogverse - School of Gaming";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [pressStart2P, interRegular, interSemiBold] = await Promise.all([
    fetch(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf"
    ).then((res) => res.arrayBuffer()),
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
          justifyContent: "space-between",
          background: DARK_THEME.bg,
          padding: "60px 80px",
        }}
      >
        {/* Row 1: Tagline — single line */}
        <div style={{ display: "flex", gap: "20px", fontFamily: "Press Start 2P", fontSize: "28px", color: DARK_THEME.foreground }}>
          <span>Where</span>
          <span style={{ color: BRAND.primary }}>Screen Time</span>
          <span>Becomes</span>
          <span style={{ color: BRAND.secondary }}>Quality Time</span>
        </div>

        {/* Row 2: SOG Sogverse — largest, dead center */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <span
            style={{
              fontFamily: "Press Start 2P",
              fontSize: "96px",
              color: BRAND.primary,
            }}
          >
            SOG
          </span>
          <span
            style={{
              fontFamily: "Inter",
              fontSize: "84px",
              fontWeight: 600,
              color: DARK_THEME.foreground,
            }}
          >
            Sogverse
          </span>
        </div>

        {/* Row 3: Yty icons with labels */}
        <div style={{ display: "flex", width: "100%", justifyContent: "space-around" }}>
          {/* Harmony */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
            </svg>
            <span style={{ fontFamily: "Inter", fontSize: "20px", fontWeight: 600, color: "#34d399" }}>Harmony</span>
          </div>
          {/* Glow */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" /><path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" /><path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
            </svg>
            <span style={{ fontFamily: "Inter", fontSize: "20px", fontWeight: 600, color: "#fbbf24" }}>Glow</span>
          </div>
          {/* Valor */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m11 19-6-6" /><path d="m5 21-2-2" />
              <path d="m8 16-4 4" /><path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
            </svg>
            <span style={{ fontFamily: "Inter", fontSize: "20px", fontWeight: 600, color: "#fb7185" }}>Valor</span>
          </div>
          {/* Wit */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 18V5" />
              <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
              <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
              <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
              <path d="M18 18a4 4 0 0 0 2-7.464" />
              <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
              <path d="M6 18a4 4 0 0 1-2-7.464" />
              <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
            </svg>
            <span style={{ fontFamily: "Inter", fontSize: "20px", fontWeight: 600, color: "#a78bfa" }}>Wit</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Press Start 2P",
          data: pressStart2P,
          style: "normal",
          weight: 400,
        },
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

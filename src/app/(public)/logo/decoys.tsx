import type { ReactNode } from "react";

/**
 * Stand-in favicons for the tab-strip demo on `/logo`.
 *
 * These are simplified approximations of third-party marks, drawn by us so the
 * scanability test has realistic neighbours: at 16px what carries recognition is
 * a dominant colour plus a rough silhouette, and that is all these reproduce.
 * They are **temporary design references on a short-lived branch**, not assets —
 * nothing here is an official mark, and none of it belongs in a shipped surface.
 * Delete this file along with the route.
 *
 * Hex is used directly rather than the tokens in `lib/constants/colors.ts`
 * because these depict other companies' colours, not ours. The same reasoning
 * applies to `CHROME` in `browser-chrome.ts`: a value that is a picture of some
 * external thing is not a brand colour and has no token to come from.
 */
export type Decoy = { readonly title: string; readonly icon: ReactNode };

const Tile = ({ fill, rx = 3 }: { fill: string; rx?: number }) => (
  <rect width="16" height="16" rx={rx} fill={fill} />
);

export const DECOYS: readonly Decoy[] = [
  {
    title: "Inbox (24) - kyle@sog.gg - Gmail",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M2.4 4.6v7h2.1V7.4L8 9.9l3.5-2.5v4.2h2.1v-7L8 8.6 2.4 4.6z" fill="#EA4335" />
      </>
    ),
  },
  {
    title: "Sogverse HQ - Calendar - Week",
    icon: (
      <>
        <Tile fill="#fff" />
        <rect x="2.5" y="3" width="11" height="10.5" rx="1.4" fill="none" stroke="#4285F4" strokeWidth="1.6" />
        <rect x="2.5" y="3" width="11" height="2.6" fill="#4285F4" />
        <rect x="5" y="7.5" width="6" height="1.6" fill="#4285F4" />
      </>
    ),
  },
  {
    title: "Products architecture - Google Docs",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M4 2.5h5l3 3v8H4z" fill="#4285F4" />
        <path d="M9 2.5l3 3H9z" fill="#a1c2fa" />
        <rect x="5.6" y="7.4" width="4.8" height="0.9" fill="#fff" />
        <rect x="5.6" y="9.4" width="4.8" height="0.9" fill="#fff" />
      </>
    ),
  },
  {
    title: "SOGGA finance report - Google Sheets",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M4 2.5h5l3 3v8H4z" fill="#0F9D58" />
        <path d="M9 2.5l3 3H9z" fill="#9cdcbe" />
        <rect x="5.6" y="7.2" width="4.8" height="3.6" fill="none" stroke="#fff" strokeWidth="0.9" />
        <path d="M8 7.2v3.6M5.6 9h4.8" stroke="#fff" strokeWidth="0.9" />
      </>
    ),
  },
  {
    title: "#engineering - Sogverse HQ - Slack",
    icon: (
      <>
        <Tile fill="#fff" />
        <rect x="2.2" y="6.6" width="4" height="2.8" rx="1.4" fill="#36C5F0" />
        <rect x="6.6" y="2.2" width="2.8" height="4" rx="1.4" fill="#2EB67D" />
        <rect x="9.8" y="6.6" width="4" height="2.8" rx="1.4" fill="#ECB22E" />
        <rect x="6.6" y="9.8" width="2.8" height="4" rx="1.4" fill="#E01E5A" />
      </>
    ),
  },
  {
    title: "Roadmap Q3 - Notion",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M4.4 3.6h2.2l4 5.6V3.6h1.5v8.8h-2L6 6.6v5.8H4.4z" fill="#191918" />
      </>
    ),
  },
  {
    title: "SOG-412 Favicon refresh - Linear",
    icon: (
      <>
        <Tile fill="#5E6AD2" />
        <path
          d="M3.4 9.6l3 3M3.2 7l5.8 5.8M3.6 4.6l7.8 7.8"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    title: "sog-gg/sogverse: the platform - GitHub",
    icon: (
      <>
        <Tile fill="#1f2328" />
        <path
          d="M8 2.6A5.4 5.4 0 006.3 13c.3.05.4-.12.4-.28v-1.1c-1.5.33-1.82-.63-1.82-.63-.25-.63-.6-.8-.6-.8-.5-.33 0-.33 0-.33.54.04.83.56.83.56.48.83 1.27.6 1.58.45.05-.35.19-.6.34-.73-1.2-.14-2.46-.6-2.46-2.67 0-.6.21-1.07.56-1.45-.06-.14-.24-.72.05-1.5 0 0 .46-.15 1.5.55a5.2 5.2 0 012.72 0c1.04-.7 1.5-.55 1.5-.55.29.78.11 1.36.05 1.5.35.38.56.85.56 1.45 0 2.08-1.27 2.53-2.47 2.66.2.17.37.5.37 1v1.5c0 .16.1.34.4.28A5.4 5.4 0 008 2.6z"
          fill="#fff"
        />
      </>
    ),
  },
  {
    title: "Sogverse design system - Figma",
    icon: (
      <>
        <Tile fill="#2c2c2c" />
        <path d="M6.6 2.6h2v3.2h-2a1.6 1.6 0 110-3.2z" fill="#F24E1E" />
        <path d="M8.6 2.6h1.2a1.6 1.6 0 110 3.2H8.6z" fill="#FF7262" />
        <path d="M6.6 6.4h2v3.2h-2a1.6 1.6 0 110-3.2z" fill="#A259FF" />
        <path d="M6.6 10.2h2v1.6a1.6 1.6 0 11-2-1.6z" fill="#0ACF83" />
        <circle cx="10.2" cy="8" r="1.6" fill="#1ABCFE" />
      </>
    ),
  },
  {
    title: "Payments - Stripe Dashboard",
    icon: (
      <>
        <Tile fill="#635BFF" />
        <path
          d="M7.5 6.5c0-.45.4-.62.95-.62.85 0 1.9.28 2.75.72V4.4a6.8 6.8 0 00-2.75-.5c-2.25 0-3.75 1.15-3.75 3.05 0 2.75 3.6 2.3 3.6 3.5 0 .45-.4.65-1.05.65-.95 0-2.15-.42-3-.95v2.4c.95.4 1.95.6 3 .6 2.3 0 3.9-1.05 3.9-2.95 0-2.95-3.65-2.45-3.65-3.7z"
          fill="#fff"
        />
      </>
    ),
  },
  {
    title: "sogverse - Deployments - Vercel",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M8 3l5.2 9H2.8z" fill="#000" />
      </>
    ),
  },
  {
    title: "Table editor | sogverse - Supabase",
    icon: (
      <>
        <Tile fill="#1c1c1c" />
        <path d="M8.7 2.4v5.1h3.4L7.4 13.6V8.5H4z" fill="#3ECF8E" />
      </>
    ),
  },
  {
    title: "Minecraft redstone tutorial - YouTube",
    icon: (
      <>
        <Tile fill="#fff" />
        <rect x="1.4" y="3.6" width="13.2" height="8.8" rx="2.4" fill="#FF0000" />
        <path d="M6.6 5.9l4.2 2.1-4.2 2.1z" fill="#fff" />
      </>
    ),
  },
  {
    title: "gamedev-fi - Discord",
    icon: (
      <>
        <Tile fill="#5865F2" />
        <ellipse cx="6" cy="8.4" rx="1.25" ry="1.5" fill="#fff" />
        <ellipse cx="10" cy="8.4" rx="1.25" ry="1.5" fill="#fff" />
        <path
          d="M4.4 5.4c1-.6 2.2-.9 3.6-.9s2.6.3 3.6.9"
          stroke="#fff"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    title: "Roblox Creator Dashboard",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M4.2 2.2l9.6 2.6-2.6 9.6-9.6-2.6z" fill="#E2231A" />
        <path d="M6.9 6.6l3.1.85-.85 3.1-3.1-.85z" fill="#fff" />
      </>
    ),
  },
  {
    title: "Minecraft: Java Edition",
    icon: (
      <>
        <Tile fill="#8B6B4A" rx={1} />
        <rect x="1" y="1" width="7" height="7" fill="#5C9E4A" />
        <rect x="8" y="8" width="7" height="7" fill="#5C9E4A" />
        <rect x="8" y="1" width="7" height="7" fill="#7A5C3E" />
        <rect x="1" y="8" width="7" height="7" fill="#6B4F35" />
      </>
    ),
  },
  {
    title: "ChatGPT",
    icon: (
      <>
        <Tile fill="#fff" />
        <path
          d="M8 2.6l4.4 2.5v5.8L8 13.4 3.6 10.9V5.1z"
          fill="none"
          stroke="#0d0d0d"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    title: "Kyle Hutchinson | LinkedIn",
    icon: (
      <>
        <Tile fill="#0A66C2" />
        <rect x="3.2" y="6.4" width="1.9" height="6" fill="#fff" />
        <circle cx="4.15" cy="4.3" r="1.15" fill="#fff" />
        <path
          d="M6.6 6.4h1.8v.9c.35-.6 1-1 1.9-1 1.5 0 2.3.9 2.3 2.7v3.4h-1.9V9.3c0-.9-.35-1.4-1.1-1.4s-1.2.5-1.2 1.45v3.05H6.6z"
          fill="#fff"
        />
      </>
    ),
  },
  {
    title: "Home / X",
    icon: (
      <>
        <Tile fill="#000" />
        <path d="M3.6 3.4h2.6l2.3 3.1 2.6-3.1h1.4l-3.3 4 3.6 4.9h-2.6L7.7 8.9l-2.8 3.4H3.5l3.5-4.2z" fill="#fff" />
      </>
    ),
  },
  {
    title: "WhatsApp",
    icon: (
      <>
        <Tile fill="#25D366" />
        <path
          d="M5 4.6c.5-.5 1.1-.3 1.4.2l.6 1c.2.4.1.7-.2 1l-.4.4c.5 1 1.3 1.8 2.3 2.3l.4-.4c.3-.3.6-.4 1-.2l1 .6c.5.3.7.9.2 1.4-1 1-2.4.8-4.2-.7S4 5.6 5 4.6z"
          fill="#fff"
        />
      </>
    ),
  },
  {
    title: "Amazon.co.uk Shopping Basket",
    icon: (
      <>
        <Tile fill="#232F3E" />
        <path d="M4 4.4h8v4H4z" fill="#fff" fillOpacity="0.85" />
        <path
          d="M2.6 10.6c2.8 1.9 7.2 1.9 10.4-.2"
          stroke="#FF9900"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    title: "Helsinki - Wikipedia",
    icon: (
      <>
        <Tile fill="#fff" />
        <path
          d="M1.6 5.2h3.2v.9l-.7.15 1.5 4.2 1.3-3.6-.3-.75-.6-.1v-.8h2.9v.8l-.7.15 1.5 4.2 1.4-4.2-.75-.15v-.8h2.5v.8l-.7.2-2.3 6.1h-1l-1.4-3.8-1.5 3.8h-1L2.9 6.25l-.7-.15z"
          fill="#000"
        />
      </>
    ),
  },
  {
    title: "r/gamedev - Reddit",
    icon: (
      <>
        <Tile fill="#FF4500" />
        <circle cx="8" cy="9" r="4.2" fill="#fff" />
        <circle cx="6.4" cy="8.6" r="0.7" fill="#FF4500" />
        <circle cx="9.6" cy="8.6" r="0.7" fill="#FF4500" />
        <circle cx="11.4" cy="4.2" r="1.1" fill="#fff" />
      </>
    ),
  },
  {
    title: "Spotify - Focus Beats",
    icon: (
      <>
        <Tile fill="#1DB954" rx={8} />
        <path
          d="M4.4 6.2c2.4-.7 5-.5 7.2.7M5 8.6c2-.55 4.1-.4 5.9.6M5.6 10.9c1.6-.45 3.3-.3 4.7.5"
          stroke="#000"
          strokeWidth="1.15"
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    title: "sog.gg - Cloudflare Dashboard",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M11.4 10.6H4.2a2 2 0 01.4-3.95 3 3 0 015.7-.6 2.2 2.2 0 011.1 4.55z" fill="#F38020" />
      </>
    ),
  },
  {
    title: "next - npm",
    icon: (
      <>
        <Tile fill="#CB3837" />
        <path d="M2.4 5.2h11.2v5.6H8.9V6.9H7.5v3.9H2.4z" fill="#fff" />
      </>
    ),
  },
  {
    title: "javascript - How do I ... - Stack Overflow",
    icon: (
      <>
        <Tile fill="#fff" />
        <path d="M11.2 12V9.4h1.4V13.4H3.4V9.4h1.4V12z" fill="#BCBBBB" />
        <path
          d="M6 9.9l5.1 1.1.3-1.3-5.1-1.1zM6.7 7.1l4.7 2.2.6-1.2-4.7-2.2zM8.1 4.5l4 3.3.85-1.05-4-3.3zM5.7 12.6h5.2v-1.3H5.7z"
          fill="#F48024"
        />
      </>
    ),
  },
];

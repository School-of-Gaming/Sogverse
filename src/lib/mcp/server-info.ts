import type { Implementation } from "@modelcontextprotocol/server";

/**
 * The server's icon: the app's own icon files, at the fixed, unhashed paths
 * Next serves them on. The PNG is the format every icon-rendering client must
 * support; the SVG is the one most also take.
 */
export const MCP_SERVER_ICONS = [
  { path: "/apple-icon.png", mimeType: "image/png", sizes: ["180x180"] },
  { path: "/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
] as const;

/**
 * Who the server says it is in `initialize`, its icon included. The icon is
 * declared because a client left without one guesses: Claude.ai has shown the
 * favicon of the connector URL's parent domain, which is the marketing site's
 * badge, not the app's. Every icon is on `origin`, the trusted origin of the
 * request being served, since the spec asks a client to accept an icon only
 * from the server's own origin — so staging and production each name their own.
 */
export function mcpServerInfo(origin: string): Implementation {
  return {
    name: "sogverse",
    version: "1.0.0",
    icons: MCP_SERVER_ICONS.map(({ path, mimeType, sizes }) => ({
      src: `${origin}${path}`,
      mimeType,
      sizes: [...sizes],
    })),
  };
}

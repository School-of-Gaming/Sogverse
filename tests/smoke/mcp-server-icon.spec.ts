import { test, expect } from "@playwright/test";
import { MCP_SERVER_ICONS } from "@/lib/mcp/server-info";

// The MCP server names these files as its icon, and a client fetches them
// cross-origin, without credentials, and — per the spec — refuses a redirect.
// They are Next's icon file conventions, served only by a built app, so this is
// where they can be held to answering directly: the image itself, its declared
// type, no locale redirect and no session cookie from the proxy.
for (const { path, mimeType } of MCP_SERVER_ICONS) {
  test(`serves the MCP server's icon at ${path}`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(mimeType);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  });
}

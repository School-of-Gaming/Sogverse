import {
  generateProtectedResourceMetadata,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { MCP_ENDPOINT_PATH, mcpTokenIssuer } from "@/lib/mcp/auth";
import { getOrigin } from "@/lib/url";

/**
 * The MCP endpoint's protected-resource metadata (RFC 9728): which resource
 * this is, and which authorization server issues tokens for it — the project's
 * own Supabase Auth. A client reaches it from the `resource_metadata` in the
 * endpoint's 401, then discovers that server and registers itself there.
 *
 * Public by nature — it is the first thing an unauthenticated client reads —
 * and it names nothing that is not already in the client's hands. The resource
 * is built on `getOrigin`, never on the forwarding headers, so a spoofed host
 * cannot make the document point a client at somebody else's endpoint.
 *
 * `scopes_supported` is `email` alone: no `openid`, because no consumer here
 * needs an ID token, and no `offline_access`, because Supabase issues refresh
 * tokens without it.
 */
export function GET(request: Request): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [mcpTokenIssuer()],
    resourceUrl: `${getOrigin(request)}${MCP_ENDPOINT_PATH}`,
    additionalMetadata: {
      scopes_supported: ["email"],
      resource_name: "Sogverse",
    },
  });
  return Response.json(metadata, {
    headers: {
      // Browser-based MCP clients read this cross-origin.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

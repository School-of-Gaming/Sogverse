import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { readMcpCaller } from "@/lib/mcp/auth";
import { getOrigin } from "@/lib/url";

/**
 * What `whoami` answers. `server` is the origin the request reached, which is
 * how an admin with a connector to each environment tells which one a
 * conversation is pointed at before anything is changed through it.
 */
const whoamiOutput = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  clientId: z.string(),
  server: z.string().nullable(),
  tokenExpiresAt: z.string().nullable(),
});

/** The core tools: identity and environment, before any area's own tools. */
export function registerCoreTools(server: McpServer): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "The School of Gaming admin this connection acts as, the AI app's client id, which Sogverse environment it is connected to, and when its access token expires.",
      outputSchema: whoamiOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (ctx) => {
      const authInfo = ctx.http?.authInfo;
      const caller = readMcpCaller(authInfo);
      if (!authInfo || !caller) {
        // Unreachable behind the gate, which lets no request through without
        // an admin's auth info; said rather than assumed.
        return {
          isError: true,
          content: [{ type: "text", text: "No verified caller on this request." }],
        };
      }
      const request = ctx.http?.req;
      const result = whoamiOutput.parse({
        userId: caller.userId,
        email: caller.email,
        role: caller.role,
        clientId: authInfo.clientId,
        server: request ? getOrigin(request) : null,
        tokenExpiresAt:
          authInfo.expiresAt === undefined
            ? null
            : new Date(authInfo.expiresAt * 1000).toISOString(),
      });
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

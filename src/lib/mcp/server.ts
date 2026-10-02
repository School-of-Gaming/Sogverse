import { createMcpHandler } from "mcp-handler";
import { registerCoreTools } from "@/lib/mcp/core";

/**
 * Sogverse's MCP server: one module per area, each registering its own tools.
 * An area added later is one more `register…` call here and nothing else — the
 * gate in front of the handler is the endpoint's, not any tool's.
 *
 * Stateless, as mcp-handler 2 serves it: every request builds a fresh server
 * from this factory, so no tool may keep state between calls.
 */
export function createSogverseMcpHandler(): (request: Request) => Promise<Response> {
  return createMcpHandler(
    (server) => {
      registerCoreTools(server);
    },
    {
      serverInfo: { name: "sogverse", version: "1.0.0" },
      instructions:
        "Sogverse is School of Gaming's platform. This server acts as the signed-in School of Gaming admin. Call whoami first to confirm which environment you are connected to.",
    },
  );
}

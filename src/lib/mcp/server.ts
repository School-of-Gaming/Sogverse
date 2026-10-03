import { createMcpHandler } from "mcp-handler";
import { registerCoreTools } from "@/lib/mcp/core";
import { registerCoverUploader } from "@/lib/mcp/cover-uploader";
import { registerLibraryTools } from "@/lib/mcp/library";
import { registerLibraryCoverTools } from "@/lib/mcp/library-covers";

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
      registerLibraryTools(server);
      registerLibraryCoverTools(server);
      registerCoverUploader(server);
    },
    {
      serverInfo: { name: "sogverse", version: "1.0.0" },
      // The JSON-RPC method of every request, in the request's own log line:
      // Vercel records only the path, and a request that never finishes is
      // otherwise anonymous.
      onEvent: (event) => {
        if (event.type === "REQUEST_RECEIVED") console.info(`[mcp] ${event.method}`);
      },
      instructions:
        "Sogverse is School of Gaming's platform. This server acts as the signed-in School of Gaming admin. Call whoami first to confirm which environment you are connected to. The Library tools read, write and publish the parent-facing articles of the public Library, and choose, show and upload their covers.",
    },
  );
}

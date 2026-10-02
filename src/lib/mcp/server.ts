import { createMcpHandler } from "mcp-handler";
import { registerCoreTools } from "@/lib/mcp/core";
import { registerCoverUploader } from "@/lib/mcp/cover-uploader";
import { registerLibraryTools } from "@/lib/mcp/library";
import { registerLibraryCoverTools } from "@/lib/mcp/library-covers";
import { mcpServerInfo } from "@/lib/mcp/server-info";

/**
 * Sogverse's MCP server: one module per area, each registering its own tools.
 * An area added later is one more `register…` call here and nothing else — the
 * gate in front of the handler is the endpoint's, not any tool's.
 *
 * Stateless, as mcp-handler 2 serves it: every request builds a fresh server
 * from this factory, so no tool may keep state between calls. `origin` is the
 * trusted origin of the request being served, which the server's icon names.
 */
export function createSogverseMcpHandler(
  origin: string,
): (request: Request) => Promise<Response> {
  return createMcpHandler(
    (server) => {
      registerCoreTools(server);
      registerLibraryTools(server);
      registerLibraryCoverTools(server);
      registerCoverUploader(server);
    },
    {
      serverInfo: mcpServerInfo(origin),
      instructions:
        "Sogverse is School of Gaming's platform. This server acts as the signed-in School of Gaming admin. Call whoami first to confirm which environment you are connected to. The Library tools read, write and publish the parent-facing articles of the public Library, and choose, show and upload their covers.",
    },
  );
}

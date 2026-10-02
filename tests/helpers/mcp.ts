import { z } from "zod";

/**
 * Talking to the MCP endpoint from a test: a request as a client sends one,
 * and the JSON-RPC answer read back out of it.
 */

export const MCP_TEST_ORIGIN = "http://localhost:3000";

/** A JSON-RPC request to the endpoint, carrying a bearer token unless `token` is null. */
export function mcpRequest(
  body: unknown,
  token: string | null = "token",
  method = "POST",
): Request {
  return new Request(`${MCP_TEST_ORIGIN}/api/mcp`, {
    method,
    headers: {
      host: "localhost:3000",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

/** A JSON-RPC answer, whether it came back as JSON or as one SSE event. */
export async function readRpc(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const data = text.split("\n").filter((line) => line.startsWith("data:"));
  return z
    .record(z.unknown())
    .parse(JSON.parse(data.length ? data[data.length - 1].slice(5) : text));
}

const toolResult = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.record(z.unknown()).optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export type McpToolResult = z.infer<typeof toolResult>;

/** Call one tool through `post` and read its result. */
export async function callTool(
  post: (request: Request) => Promise<Response>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResult> {
  const body = await readRpc(
    await post(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    ),
  );
  return toolResult.parse(body.result);
}

/** The text a tool answered with, joined. */
export function resultText(result: McpToolResult): string {
  return result.content.map((block) => block.text ?? "").join("\n");
}

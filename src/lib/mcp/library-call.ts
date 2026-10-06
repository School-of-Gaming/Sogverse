import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { readMcpCaller } from "@/lib/mcp/auth";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import { libraryWriteFailure } from "@/services/library";
import { LibraryService } from "@/services/library/library.service";
import type { AppSupabaseClient } from "@/types";

/*
 * What every Library tool runs on: the admin's own token-bound client, the
 * answer and refusal shapes, and the annotations the tools share. The article
 * tools (`library.ts`) and the cover tools (`library-covers.ts`) are one
 * area split for size, so they speak alike.
 */

export const articleId = z
  .guid()
  .describe("The article's id, as list_library_articles returns it.");

/** A tool's answer: the structured value, and the same as text for clients that read only that. */
export function answer<T extends Record<string, unknown>>(value: T): CallToolResult {
  return {
    structuredContent: value,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/** A refusal the AI app reads and acts on: a tool error, never a protocol error. */
export function refusal(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export const NOT_FOUND = "No Library article has that id.";

/**
 * A failed call as the AI app reads it. A database refusal carries the
 * sentence the database wrote for an admin, quoted as is; anything else is a
 * fault on our side, logged, and answered without its developer-facing detail.
 */
function failure(error: unknown): CallToolResult {
  const read = libraryWriteFailure(error);
  if (read.kind === "reason") return refusal(read.reason);
  console.error("[mcp] library tool failed:", error);
  return refusal(
    "Sogverse could not complete this. Read the article again to see what was saved before retrying.",
  );
}

/** What every Library tool runs with. */
export interface LibraryCall {
  service: LibraryService;
  /** The admin's own token-bound client, for the image catalogue's service. */
  client: AppSupabaseClient;
  /** The origin links are built on. */
  origin: string;
}

/**
 * Run a tool body as the admin the gate let through. The client is bound to
 * the admin's own token, never the service role.
 */
export async function asAdmin(
  ctx: ServerContext,
  run: (call: LibraryCall) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const request = ctx.http?.req;
  if (!authInfo || !readMcpCaller(authInfo) || !request) {
    // Unreachable behind the gate, which lets no request through without an
    // admin's auth info; said rather than assumed.
    return refusal("No verified caller on this request.");
  }
  try {
    const client = createBearerClient(authInfo.token);
    return await run({
      service: new LibraryService(client),
      client,
      origin: getOrigin(request),
    });
  } catch (error) {
    return failure(error);
  }
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const OVERWRITES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

import { withMcpAdmin } from "@/lib/mcp/auth";
import { createSogverseMcpHandler } from "@/lib/mcp/server";

/**
 * The analytics tools read Vercel's request log one day per call, and Vercel
 * takes up to half a minute over an older day, so an hour's first read can run
 * long — the admin Analytics page allows the same.
 */
export const maxDuration = 120;

/**
 * /api/mcp — Sogverse's remote MCP endpoint, for an admin working through an AI
 * app. Streamable HTTP, stateless: POST carries the JSON-RPC traffic, and GET is
 * the 2025-era stream opener, which a stateless server answers 405 once the
 * caller is through the gate.
 *
 * The whole authorization is `withMcpAdmin` — an OAuth access token from the
 * project's own Auth server, granted to a client, held by an admin, re-checked
 * on every request (`src/lib/mcp/`). A request without one is answered 401 with
 * the challenge that points at this endpoint's protected-resource metadata,
 * which is how a client given only this URL finds where to sign in.
 */
const handler = withMcpAdmin(createSogverseMcpHandler());

export const GET = handler;
export const POST = handler;

import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import {
  landingPagePath,
  type AddressableLandingPage,
} from "@/components/landing-pages/landing-page-address";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { readMcpCaller } from "@/lib/mcp/auth";
import { refusal } from "@/lib/mcp/library-call";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import type { SupportedLocale } from "@/lib/constants/locales";
import { landingWriteFailure } from "@/services/landing-pages";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import type { AppSupabaseClient } from "@/types";

/*
 * What every landing page tool runs on: the admin's own token-bound client,
 * the refusal reading and the addresses. The page tools (`landing-pages.ts`)
 * and the picture tools (`landing-pages-images.ts`) are one area split for
 * size. The answer shapes and annotations are the Library's
 * (`library-call.ts`), so every area speaks alike.
 */

export const pageId = z
  .guid()
  .describe("The landing page's id, as list_landing_pages returns it.");

export const NOT_FOUND = "No landing page has that id.";

/**
 * A failed call as the AI app reads it: a database refusal written for an
 * admin quoted as is, anything else logged and answered without its
 * developer-facing detail.
 */
function failure(error: unknown): CallToolResult {
  const read = landingWriteFailure(error);
  if (read.kind === "reason") return refusal(read.reason);
  console.error("[mcp] landing page tool failed:", error);
  return refusal(
    "Sogverse could not complete this. Read the page again with get_landing_page to see what was saved before retrying.",
  );
}

/** What every landing page tool runs with. */
export interface LandingCall {
  service: LandingPageService;
  /** The admin's own token-bound client, for the image catalogue's service. */
  client: AppSupabaseClient;
  /** The origin links are built on. */
  origin: string;
}

/** Run a tool body as the admin the gate let through, on their own token. */
export async function asLandingAdmin(
  ctx: ServerContext,
  run: (call: LandingCall) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const request = ctx.http?.req;
  if (!authInfo || !readMcpCaller(authInfo) || !request) {
    // Unreachable behind the gate; said rather than assumed.
    return refusal("No verified caller on this request.");
  }
  try {
    const client = createBearerClient(authInfo.token);
    return await run({
      service: new LandingPageService(client),
      client,
      origin: getOrigin(request),
    });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * A live page's public link in one language — its slug there, else its id —
 * as the page itself links it, absolute on the request's origin.
 */
export function publicLink(
  origin: string,
  publication: AddressableLandingPage,
  at: SupportedLocale,
): string {
  return `${origin}${landingPagePath(publication, at)}`;
}

/**
 * Where a version with this slug is read once its language is live, or null
 * while it has no slug.
 */
export function slugLink(origin: string, slug: string, at: SupportedLocale): string | null {
  return slug === ""
    ? null
    : `${origin}${getPathname({ href: ROUTES.landingPage(slug), locale: at })}`;
}

/** The admin-only preview of the working copy, in one language. */
export function previewLink(origin: string, id: string, at: SupportedLocale): string {
  return `${origin}${getPathname({ href: ROUTES.landingPagePreview(id), locale: at })}`;
}

/** The page's editor in Sogverse. */
export function editorLink(origin: string, id: string): string {
  return `${origin}${getPathname({
    href: { pathname: "/admin/landing-pages/[id]", params: { id } },
    locale: "en",
  })}`;
}

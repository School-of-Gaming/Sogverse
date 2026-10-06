import type {
  CallToolResult,
  ServerContext,
  StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import {
  landingPagePath,
  type AddressableLandingPage,
} from "@/components/landing-pages/landing-page-address";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import {
  landingItemNoun,
  landingSectionName,
} from "@/lib/landing-pages/describe-missing";
import {
  LANDING_SECTION_TYPES,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
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

/**
 * The page's status page in Sogverse admin: each language's state, its preview
 * and public links, and publishing.
 */
export function adminLink(origin: string, id: string): string {
  return `${origin}${getPathname({
    href: { pathname: "/admin/landing-pages/[id]", params: { id } },
    locale: "en",
  })}`;
}

// ---------------------------------------------------------------------------
// Refusals of input, in an admin's words
// ---------------------------------------------------------------------------

/** One schema issue, from zod 3 or zod 4, as far as a sentence needs it. */
export interface InputIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** A section as far as naming it needs: what an AI app sent, or what is stored. */
interface NamedSection {
  readonly id?: unknown;
  readonly type?: unknown;
}

function sectionTypeOf(section: NamedSection | undefined): LandingSectionType | null {
  const type = section?.type;
  return LANDING_SECTION_TYPES.find((known) => known === type) ?? null;
}

function sectionCalled(number: number, section: NamedSection | undefined): string {
  const type = sectionTypeOf(section);
  return type === null ? `section ${number}` : landingSectionName(number, type);
}

/**
 * The part of a path inside one section, as an admin counts it: an item or
 * picture by its number from one (`point 3`), then the field (`button.url`).
 */
function insideSection(rest: readonly PropertyKey[], type: LandingSectionType | null): string {
  const parts: string[] = [];
  const field: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const next = rest[i + 1];
    if ((key === "items" || key === "images" || key === "alts") && typeof next === "number") {
      const noun = (type === null ? null : landingItemNoun(type)) ?? "item";
      parts.push(`${noun} ${next + 1}`);
      i++;
    } else {
      field.push(String(key));
    }
  }
  if (field.length > 0) parts.push(field.join("."));
  return parts.join(", ");
}

/**
 * Where an issue is, in the words every landing page answer uses: a section
 * as "section N (Type label)", numbered from one, wherever it is named — by
 * its position in a structure sent, or by its id among `sections`.
 */
export function issuePlace(
  path: readonly PropertyKey[],
  sections: readonly NamedSection[],
): string {
  const [head, at, ...rest] = path;
  if (head === "sections" && typeof at === "number") {
    const section = sections[at];
    return [sectionCalled(at + 1, section), insideSection(rest, sectionTypeOf(section))]
      .filter((part) => part !== "")
      .join(", ");
  }
  if (head === "sectionTexts" && typeof at === "string") {
    const index = sections.findIndex((section) => section.id === at);
    const section = sections[index];
    const where =
      index === -1
        ? `the words for section ${at}`
        : `the words of ${sectionCalled(index + 1, section)}`;
    return [where, insideSection(rest, sectionTypeOf(section))]
      .filter((part) => part !== "")
      .join(", ");
  }
  return path.map(String).join(".");
}

/** One issue as a sentence: its place, then what is wrong there. */
export function issueSentence(issue: InputIssue, sections: readonly NamedSection[]): string {
  const place = issuePlace(issue.path, sections);
  if (place === "") return issue.message;
  return `${place.charAt(0).toUpperCase()}${place.slice(1)}: ${issue.message}`;
}

function sectionsSent(value: unknown): readonly NamedSection[] {
  if (typeof value !== "object" || value === null) return [];
  const sections: unknown = Object.getOwnPropertyDescriptor(value, "sections")?.value;
  return Array.isArray(sections)
    ? sections.map((section): NamedSection =>
        typeof section === "object" && section !== null ? section : {},
      )
    : [];
}

/**
 * A landing tool's input schema whose refusals are sentences. `advertised` is
 * what the AI app is shown as JSON Schema; `checked` is what the call is
 * checked by, and may be looser where the tool checks a part itself against
 * the page — a language's words, against the page's structure — and says so
 * better than a schema could. Every issue comes back without a path, its
 * place already said in the sentence, so the SDK prints it as written.
 */
export function readableInput<Checked extends z.ZodType>(
  advertised: z.ZodType,
  checked: Checked,
): StandardSchemaWithJSON<z.input<Checked>, z.output<Checked>> {
  return {
    "~standard": {
      version: 1,
      vendor: "sogverse",
      jsonSchema: advertised["~standard"].jsonSchema,
      validate: (value) => {
        const result = checked.safeParse(value);
        if (result.success) return { value: result.data };
        const sections = sectionsSent(value);
        return {
          issues: result.error.issues.map((issue) => ({
            message: issueSentence(issue, sections),
          })),
        };
      },
    },
  };
}

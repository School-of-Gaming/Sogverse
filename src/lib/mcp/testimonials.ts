import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { LOCALE_CONFIG, SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { readMcpCaller } from "@/lib/mcp/auth";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import {
  HOME_SPOT_SIZE,
  HOME_TESTIMONIAL_SPOTS,
  QUOTATION_MARKS,
  hasQuotationMarks,
  homePlacement,
  testimonialWriteFailure,
  type AdminTestimonial,
  type TestimonialUsage,
} from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";
import type { HomeTestimonialSpot } from "@/types";

/*
 * The testimonial tools: an admin keeps Marketing's store of testimonials from
 * an AI app — reads them and where each is shown, creates them, writes or
 * removes one language at a time. Nothing deletes a testimonial. Every tool
 * runs the testimonial service on the admin's own token-bound client, so the
 * admin-guarded functions decide exactly as they do in the editor, and a write
 * is stamped with the admin and the app it came through. Edits go through the
 * one-language writers, never the editor's whole save
 * (`src/services/testimonials/CLAUDE.md`).
 *
 * The home spots are read here and never set: which testimonial fills a home
 * spot is a developer's decision, made in a migration.
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

const LANGUAGES = SUPPORTED_LOCALES.map(
  (locale) => `${locale} (${LOCALE_CONFIG[locale].label})`,
).join(", ");

const REAL_WORDS =
  "A testimonial is real words from a real parent, gamer or gedu, which the admin supplies. Never write, invent, embellish, shorten or \"improve\" a testimonial's words, and never draft one for the admin to approve: store exactly what the admin gives you. Translating an admin-supplied quote into another supported language is fine — that is what the language versions are for — as long as the translation says what the original says.";

const VERSIONS =
  "A testimonial is written per language: each version has whom the quote is from (`from`, short text such as \"Mum, Finland\" or \"Gedu Pixel\") and the quote, both required. Readers see the version in their own language, else English, else the first one written.";

const NO_MARKS = `The quote is stored without quotation marks: the site wraps it in each language's own. A quote starting or ending with any of ${[...QUOTATION_MARKS].join(" ")} is refused; apostrophes are fine.`;

const SPOTS =
  "The home page shows testimonials in three spots — feature (the one quote under the hero), safety (two, beside the safety facts) and row (three, under \"What parents tell us\") — and About shows the same ones. Which testimonial fills a spot is decided by a developer, never by a tool; editing a placed testimonial's words changes them on both pages at once.";

const KEPT =
  "Testimonials are never deleted: once created they stay. One comes off the site by being removed from where it is shown, and which testimonial fills a home spot is decided by a developer, never by a tool.";

const NOT_FOUND = "No testimonial has that id.";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const testimonialId = z
  .guid()
  .describe("The testimonial's id, as list_testimonials returns it.");

const locale = z
  .enum(SUPPORTED_LOCALES)
  .describe(`The language version, by site locale: ${LANGUAGES}.`);

const from = z
  .string()
  .trim()
  .min(1, "Every language version needs to say whom the quote is from")
  .describe("Whom the quote is from, in this language, as the admin gave it. Required.");

const quote = z
  .string()
  .trim()
  .min(1, "Every language version needs its quote")
  .describe(`The words in this language, exactly as the admin supplied them or faithfully translated. Required. ${NO_MARKS}`);

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

interface TestimonialCall {
  service: TestimonialsService;
  origin: string;
}

/** A failed call: a database refusal written for an admin quoted as is, anything else logged. */
function failure(error: unknown): CallToolResult {
  const read = testimonialWriteFailure(error);
  if (read.kind === "reason") return refusal(read.reason);
  console.error("[mcp] testimonial tool failed:", error);
  return refusal(
    "Sogverse could not complete this. Read the testimonial again with get_testimonial to see what was saved before retrying.",
  );
}

/** Run a tool body as the admin the gate let through, on their own token. */
async function asTestimonialAdmin(
  ctx: ServerContext,
  run: (call: TestimonialCall) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const request = ctx.http?.req;
  if (!authInfo || !readMcpCaller(authInfo) || !request) {
    // Unreachable behind the gate; said rather than assumed.
    return refusal("No verified caller on this request.");
  }
  try {
    return await run({
      service: new TestimonialsService(createBearerClient(authInfo.token)),
      origin: getOrigin(request),
    });
  } catch (error) {
    return failure(error);
  }
}

/** The quote refusal, before anything is sent, in the database's own words. */
function marksRefusal(at: string, text: string): CallToolResult | null {
  return hasQuotationMarks(text)
    ? refusal(
        `Nothing was saved: the ${at} quote starts or ends with a quotation mark. Leave the marks out: the site adds them in each language's own style.`,
      )
    : null;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

const SPOT_DESCRIPTION: Record<HomeTestimonialSpot, string> = {
  feature: "the single quote under the hero",
  safety: "beside the safety facts",
  row: "the \"What parents tell us\" row",
};

function editorLink(origin: string, id: string): string {
  return `${origin}${getPathname({ href: ROUTES.admin.testimonial(id), locale: "en" })}`;
}

/**
 * One place a testimonial is shown, as the AI app reads it. Every usage is a
 * home spot today; a new kind of place in `TestimonialUsage` stops this
 * compiling until it is given its own answer.
 */
function usageView(origin: string, usage: TestimonialUsage) {
  return {
    place: usage.kind,
    spot: usage.spot,
    spotDescription: SPOT_DESCRIPTION[usage.spot],
    position: usage.position,
    spotSize: HOME_SPOT_SIZE[usage.spot],
    shownOn: [
      `${origin}${getPathname({ href: ROUTES.home, locale: "en" })}`,
      // The section About quotes the home spots in.
      `${origin}${getPathname({ href: ROUTES.about, locale: "en" })}#parents`,
    ],
  };
}

function testimonialView(testimonial: AdminTestimonial, origin: string) {
  return {
    testimonialId: testimonial.id,
    versions: testimonial.versions.map((version) => ({
      locale: version.locale,
      language: LOCALE_CONFIG[version.locale].label,
      from: version.from,
      quote: version.quote,
    })),
    usedIn: testimonial.usages.map((usage) => usageView(origin, usage)),
    created: { at: testimonial.createdAt, ...testimonial.created },
    lastSaved: { at: testimonial.updatedAt, ...testimonial.lastSaved },
    editorLink: editorLink(origin, testimonial.id),
  };
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function registerTestimonialTools(server: McpServer): void {
  server.registerTool(
    "list_testimonials",
    {
      title: "List testimonials",
      description: `Every testimonial in School of Gaming's store, placed or not, most recently saved first: its id, every language version (whom it is from and the quote), where it is shown, and who created and last saved it, when and through which AI app. ${REAL_WORDS} ${VERSIONS} ${KEPT}`,
      annotations: READ_ONLY,
    },
    (ctx) =>
      asTestimonialAdmin(ctx, async ({ service, origin }) => {
        const testimonials = await service.listAdminTestimonials();
        return answer({
          testimonials: testimonials.map((testimonial) => testimonialView(testimonial, origin)),
        });
      }),
  );

  server.registerTool(
    "get_testimonial",
    {
      title: "Read a testimonial",
      description: `One testimonial whole: every language version, every place it is shown with the public pages' links, who created and last saved it, and the link to its editor in Sogverse. ${VERSIONS}`,
      inputSchema: z.object({ testimonialId }),
      annotations: READ_ONLY,
    },
    ({ testimonialId: id }, ctx) =>
      asTestimonialAdmin(ctx, async ({ service, origin }) => {
        const testimonial = await service.getAdminTestimonial(id);
        if (testimonial === null) return refusal(NOT_FOUND);
        return answer(testimonialView(testimonial, origin));
      }),
  );

  server.registerTool(
    "list_home_testimonial_spots",
    {
      title: "List the home page's testimonial spots",
      description: `The home page's testimonial spots in page order, each with its size and the testimonials filling it in reading order. ${SPOTS} A spot may be partly filled or empty; the page then shows what it has.`,
      annotations: READ_ONLY,
    },
    (ctx) =>
      asTestimonialAdmin(ctx, async ({ service }) => {
        const testimonials = await service.listAdminTestimonials();
        return answer({
          spots: HOME_TESTIMONIAL_SPOTS.map((spot) => ({
            spot,
            description: SPOT_DESCRIPTION[spot],
            size: HOME_SPOT_SIZE[spot],
            testimonials: testimonials
              .flatMap((testimonial) => {
                const home = homePlacement(testimonial.usages);
                return home?.spot === spot
                  ? [
                      {
                        position: home.position,
                        testimonialId: testimonial.id,
                        versions: testimonial.versions.map((version) => ({
                          locale: version.locale,
                          from: version.from,
                          quote: version.quote,
                        })),
                      },
                    ]
                  : [];
              })
              .sort((a, b) => a.position - b.position),
          })),
        });
      }),
  );

  server.registerTool(
    "create_testimonial",
    {
      title: "Create a testimonial",
      description: `Add a testimonial the admin has supplied to the store, with one or more language versions; add more languages later with save_testimonial_version. It is placed nowhere, so no public page shows it. ${REAL_WORDS} ${VERSIONS} ${NO_MARKS}`,
      inputSchema: z.object({
        versions: z
          .array(z.object({ locale, from, quote }))
          .min(1, "A testimonial needs at least one language version")
          .describe("The language versions, at most one per language."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ versions }, ctx) =>
      asTestimonialAdmin(ctx, async ({ service, origin }) => {
        for (const version of versions) {
          const refused = marksRefusal(LOCALE_CONFIG[version.locale].label, version.quote);
          if (refused) return refused;
        }
        if (new Set(versions.map((version) => version.locale)).size !== versions.length) {
          return refusal("Nothing was saved: each language may have one version.");
        }
        const id = await service.createTestimonial({ versions });
        return answer({ testimonialId: id, editorLink: editorLink(origin, id) });
      }),
  );

  server.registerTool(
    "save_testimonial_version",
    {
      title: "Save a testimonial's language version",
      description: `Write one language version of a testimonial — whom it is from and the quote together, replacing what that language held — or add a language it does not have yet. No other language is touched. If the testimonial is shown on the home page, the change shows there and on About at once: read get_testimonial first and tell the admin where it is shown. ${REAL_WORDS} ${NO_MARKS}`,
      inputSchema: z.object({ testimonialId, locale, from, quote }),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asTestimonialAdmin(ctx, async ({ service, origin }) => {
        const refused = marksRefusal(LOCALE_CONFIG[input.locale].label, input.quote);
        if (refused) return refused;
        await service.saveTestimonialVersion(input.testimonialId, {
          locale: input.locale,
          from: input.from,
          quote: input.quote,
        });
        const testimonial = await service.getAdminTestimonial(input.testimonialId);
        if (testimonial === null) return refusal(NOT_FOUND);
        return answer(testimonialView(testimonial, origin));
      }),
  );

  server.registerTool(
    "remove_testimonial_language",
    {
      title: "Remove a testimonial's language version",
      description:
        "Remove one language version of a testimonial; the others stay. A testimonial keeps at least one version, so its last one cannot be removed. Readers of that language then see the English version, else the first one written.",
      inputSchema: z.object({ testimonialId, locale }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ testimonialId: id, locale: at }, ctx) =>
      asTestimonialAdmin(ctx, async ({ service, origin }) => {
        await service.removeTestimonialVersion(id, at);
        const testimonial = await service.getAdminTestimonial(id);
        if (testimonial === null) return refusal(NOT_FOUND);
        return answer(testimonialView(testimonial, origin));
      }),
  );
}

import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { getPathname } from "@/i18n/navigation";
import { LOCALE_CONFIG, SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { readMcpCaller } from "@/lib/mcp/auth";
import { UPLOADER_VIEW_META, registerGuideUploadTool } from "@/lib/mcp/image-uploader";
import { adminLink } from "@/lib/mcp/landing-pages-call";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import {
  GUIDE_LABEL_MAX_LENGTH,
  GUIDE_MCP_UPLOAD_MAX_BYTES,
  GUIDE_UPLOAD_MAX_BYTES,
  guideWriteFailure,
  type AdminGuide,
  type GuideUsage,
} from "@/services/guides/guides.contracts";
import { GuidesService } from "@/services/guides/guides.service";
import type { AppSupabaseClient } from "@/types";

/*
 * The guide tools: an admin keeps Marketing's store of guides — PDFs a
 * landing page hands out, one file per language — from an AI app: reads them
 * and where each is offered, labels them, uploads or removes one language's
 * file at a time. Nothing deletes a guide. Every tool runs the guide service on
 * the admin's own token-bound client, so the admin-guarded functions decide
 * exactly as they do on the admin Guides tab (`src/services/guides/CLAUDE.md`).
 * A file is uploaded through the shared uploader view, whose app-only
 * `upload_guide` is registered beside the picture ones (`image-uploader.ts`).
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

const LANGUAGES = SUPPORTED_LOCALES.map(
  (locale) => `${locale} (${LOCALE_CONFIG[locale].label})`,
).join(", ");

const MB = 1024 * 1024;

/** A size as the store's own refusal words it. */
function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} MB`;
}

const GUIDE =
  "A guide is a PDF School of Gaming hands out from its landing pages — a parents' guide, a school's information pack — kept in Sogverse's guide store as one file per language plus a label. The label names it in admin lists only and is never shown to readers: the landing page's guide section carries the heading and words readers see. A signed-in reader downloads the file in their own language, else English, else the first uploaded; a signed-out reader is asked to create an account first.";

const FLOW =
  "To offer a guide on a landing page: find it with list_guides, or upload it with open_guide_uploader; then add a guide section naming its guideId to the page with save_landing_page_structure, and write the section's words with save_landing_page_text. Readers see the section after the next publish.";

const LIVE =
  "A landing page reads a guide's files from the store, so uploading or removing a language's file changes what every live landing page placing the guide offers at once, with no republish. usedIn lists each landing page placing it, whether readers see it there now (inLiveCopy) and whether the page's saved working copy places it, so the next publish keeps it there (inWorkingCopy).";

const KEPT =
  "Guides are never deleted: once created they stay. One comes off a landing page by that page's structure being saved without its guide section.";

/** Where the admin uploads a file the uploader cannot carry. */
const GUIDES_TAB = "the Guides tab of the Marketing hub in Sogverse's admin";

const NOT_FOUND = "No guide has that id.";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const guideId = z.guid().describe("The guide's id, as list_guides returns it.");

const locale = z
  .enum(SUPPORTED_LOCALES)
  .describe(`The file's language, by site locale: ${LANGUAGES}.`);

const label = z
  .string()
  .trim()
  .min(1, "A guide needs a label")
  .max(GUIDE_LABEL_MAX_LENGTH, `A guide's label is at most ${GUIDE_LABEL_MAX_LENGTH} characters`)
  .describe(
    `What admins call the guide in their lists, at most ${GUIDE_LABEL_MAX_LENGTH} characters. Never shown to readers.`,
  );

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

interface GuideCall {
  service: GuidesService;
  client: AppSupabaseClient;
  origin: string;
}

/** A failed call: a database refusal written for an admin quoted as is, anything else logged. */
function failure(error: unknown): CallToolResult {
  const read = guideWriteFailure(error);
  if (read.kind === "reason") return refusal(read.reason);
  console.error("[mcp] guide tool failed:", error);
  return refusal(
    "Sogverse could not complete this. Read the guide again with get_guide to see what was saved before retrying.",
  );
}

/** Run a tool body as the admin the gate let through, on their own token. */
async function asGuideAdmin(
  ctx: ServerContext,
  run: (call: GuideCall) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  const request = ctx.http?.req;
  if (!authInfo || !readMcpCaller(authInfo) || !request) {
    // Unreachable behind the gate; said rather than assumed.
    return refusal("No verified caller on this request.");
  }
  try {
    const client = createBearerClient(authInfo.token);
    return await run({ service: new GuidesService(client), client, origin: getOrigin(request) });
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/** A guide's page in Sogverse admin, or the form a new one is created on. */
function guideLink(origin: string, id: string | null): string {
  const href = id === null ? ROUTES.admin.guideNew : ROUTES.admin.guide(id);
  return `${origin}${getPathname({ href, locale: "en" })}`;
}

function usageView(origin: string, usage: GuideUsage) {
  return {
    pageId: usage.pageId,
    title: resolveTranslation(usage.titles, "en")?.title ?? null,
    inLiveCopy: usage.inLiveCopy,
    inWorkingCopy: usage.inWorkingCopy,
    adminLink: adminLink(origin, usage.pageId),
  };
}

function guideView(guide: AdminGuide, origin: string) {
  const has = new Set(guide.files.map((file) => file.locale));
  return {
    guideId: guide.id,
    label: guide.label,
    files: guide.files.map((file) => ({
      locale: file.locale,
      language: LOCALE_CONFIG[file.locale].label,
      fileName: file.fileName,
      byteSize: file.byteSize,
      size: megabytes(file.byteSize),
      uploaded: { at: file.uploadedAt, ...file.uploaded },
    })),
    languagesWithoutFile: SUPPORTED_LOCALES.filter((at) => !has.has(at)),
    usedIn: guide.usages.map((usage) => usageView(origin, usage)),
    created: { at: guide.createdAt, ...guide.created },
    lastSaved: { at: guide.updatedAt, ...guide.lastSaved },
    adminLink: guideLink(origin, guide.id),
  };
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function registerGuideTools(server: McpServer): void {
  server.registerTool(
    "list_guides",
    {
      title: "List guides",
      description: `Every guide in School of Gaming's store, placed or not, most recently saved first: its id (what a landing page's guide section takes), its label, which languages have a file and each file's name and size, the landing pages it is offered on, and who created and last saved it, when and through which AI app. ${GUIDE} ${FLOW} ${LIVE} ${KEPT}`,
      annotations: READ_ONLY,
    },
    (ctx) =>
      asGuideAdmin(ctx, async ({ service, origin }) => {
        const guides = await service.listAdminGuides();
        return answer({ guides: guides.map((guide) => guideView(guide, origin)) });
      }),
  );

  server.registerTool(
    "get_guide",
    {
      title: "Read a guide",
      description: `One guide whole: its label, every language's file, each landing page it is offered on with that page's status page in Sogverse admin, and who created and last saved it. ${LIVE}`,
      inputSchema: z.object({ guideId }),
      annotations: READ_ONLY,
    },
    ({ guideId: id }, ctx) =>
      asGuideAdmin(ctx, async ({ service, origin }) => {
        const guide = await service.getAdminGuide(id);
        if (guide === null) return refusal(NOT_FOUND);
        return answer(guideView(guide, origin));
      }),
  );

  server.registerTool(
    "save_guide_label",
    {
      title: "Rename a guide",
      description:
        "Change the label admins know a guide by. Readers never see it, so no landing page changes; no file is touched.",
      inputSchema: z.object({ guideId, label }),
      annotations: OVERWRITES,
    },
    ({ guideId: id, label: newLabel }, ctx) =>
      asGuideAdmin(ctx, async ({ service, origin }) => {
        await service.saveGuideLabel(id, newLabel);
        const guide = await service.getAdminGuide(id);
        if (guide === null) return refusal(NOT_FOUND);
        return answer(guideView(guide, origin));
      }),
  );

  server.registerTool(
    "remove_guide_language",
    {
      title: "Remove a guide's language file",
      description:
        "Remove one language's file of a guide; the others stay. A guide keeps at least one file, so its last one cannot be removed. Readers of that language then download the English file, else the first uploaded, wherever the guide is offered — live landing pages included, at once. Read get_guide first and tell the admin where it is offered.",
      inputSchema: z.object({ guideId, locale }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ guideId: id, locale: at }, ctx) =>
      asGuideAdmin(ctx, async ({ service, origin }) => {
        await service.removeGuideFile(id, at);
        const guide = await service.getAdminGuide(id);
        if (guide === null) return refusal(NOT_FOUND);
        return answer(guideView(guide, origin));
      }),
  );

  server.registerTool(
    "open_guide_uploader",
    {
      title: "Upload a guide's PDF",
      description: `Show the admin an uploader, inside this chat, where they pick a PDF from their device. It becomes one language's file: of an existing guide (guideId), replacing that language's file if it has one, or of a new guide (label), which this upload creates. The file never passes through you, and you are told the guide's id once it is stored; then place the guide on a landing page as below, unless it is placed already. The uploader takes a PDF of at most ${megabytes(GUIDE_MCP_UPLOAD_MAX_BYTES)}; a larger one can be uploaded on ${GUIDES_TAB} (up to ${megabytes(GUIDE_UPLOAD_MAX_BYTES)}), or exported smaller. Only AI apps that show MCP Apps views can upload; in any other, send the admin to ${GUIDES_TAB}. ${GUIDE} ${FLOW}`,
      inputSchema: z.object({
        guideId: guideId
          .optional()
          .describe("The guide the file is for, as list_guides returns it. Leave out for a new guide."),
        label: label
          .optional()
          .describe(
            `A new guide's label: what admins call it in their lists, at most ${GUIDE_LABEL_MAX_LENGTH} characters, never shown to readers. Only for a new guide.`,
          ),
        locale,
      }),
      annotations: READ_ONLY,
      _meta: UPLOADER_VIEW_META,
    },
    (input, ctx) =>
      asGuideAdmin(ctx, async ({ service, origin }) => {
        if ((input.guideId === undefined) === (input.label === undefined)) {
          return refusal(
            "Name either the guide the file is for (guideId) or a new guide's label (label), not both.",
          );
        }
        const language = LOCALE_CONFIG[input.locale].label;
        let guide: AdminGuide | null = null;
        if (input.guideId !== undefined) {
          guide = await service.getAdminGuide(input.guideId);
          if (guide === null) return refusal(NOT_FOUND);
        }
        const name = guide?.label ?? input.label ?? "";
        const replaces = guide?.files.find((file) => file.locale === input.locale) ?? null;
        const placed = (guide?.usages.length ?? 0) > 0;
        // Where the admin uploads it instead: this guide's page, or the new guide form.
        const elsewhere = guideLink(origin, guide?.id ?? null);

        const value = {
          guideId: guide?.id ?? null,
          label: name,
          locale: input.locale,
          replaces: replaces === null ? null : { fileName: replaces.fileName, byteSize: replaces.byteSize },
          adminLink: elsewhere,
          uploader: {
            kind: "pdf" as const,
            heading: guide === null ? "New guide" : "Guide",
            subject:
              replaces === null
                ? `The ${language} file of “${name}”`
                : `A new ${language} file for “${name}”, replacing ${replaces.fileName}`,
            maxBytes: GUIDE_MCP_UPLOAD_MAX_BYTES,
            tooLarge: `The uploader here takes a PDF of at most ${megabytes(GUIDE_MCP_UPLOAD_MAX_BYTES)}. Upload this one on ${GUIDES_TAB}, which takes up to ${megabytes(GUIDE_UPLOAD_MAX_BYTES)}, or export it smaller with Canva's "Compress file" or Acrobat's "Reduce file size".`,
            uploadTool: "upload_guide",
            arguments: {
              locale: input.locale,
              ...(guide === null ? { label: name } : { guideId: guide.id }),
            },
            language,
            actionLabel: replaces === null ? "Upload" : "Upload and replace",
            done: placed
              ? "The file is stored. Live landing pages offering this guide offer it now."
              : "The file is stored.",
            outcome: placed
              ? "Every live landing page placing the guide offers the new file now, with no republish."
              : `Place the guide on a landing page with a guide section naming its id (save_landing_page_structure), then write the section's words with save_landing_page_text.`,
          },
        };
        return {
          structuredContent: value,
          content: [
            {
              type: "text",
              text: `The guide uploader for the ${language} file of "${name}" is shown to the admin. Wait for them to pick a PDF; you will be told the guide's id once it is stored. If your app shows no uploader, it cannot render MCP Apps views: the admin can upload the PDF on ${GUIDES_TAB} (${elsewhere}), or from an AI app that shows views.\n\n${JSON.stringify(value, null, 2)}`,
            },
          ],
        };
      }),
  );

  registerGuideUploadTool(server, {
    description: `Called by the guide uploader alone. Stores one language's PDF of a guide — an existing one by guideId, or a new one created with its label — replacing that language's file if it has one. A PDF over ${megabytes(GUIDE_MCP_UPLOAD_MAX_BYTES)} is refused. It does not place the guide on any landing page.`,
    tooLarge: `It can also be uploaded on ${GUIDES_TAB}, which takes up to ${megabytes(GUIDE_UPLOAD_MAX_BYTES)}.`,
    run: (ctx, body) => asGuideAdmin(ctx, ({ client }) => body(client)),
  });
}

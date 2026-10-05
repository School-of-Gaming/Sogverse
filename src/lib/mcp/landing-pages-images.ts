import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import type { LandingSection } from "@/lib/landing-pages/sections";
import {
  COVER_THUMBNAIL,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
} from "@/lib/mcp/cover-images";
import {
  UPLOADER_VIEW_META,
  registerPictureUploadTool,
  uploaderOpening,
} from "@/lib/mcp/cover-uploader";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { NOT_FOUND, asLandingAdmin, pageId } from "@/lib/mcp/landing-pages-call";
import { CatalogueImagesService } from "@/services/catalogue-images/catalogue-images.service";

/*
 * A landing page's pictures: the image catalogue's `landing_image` entries a
 * page's sections show, the write that puts one in a section, and the
 * uploader that adds a new one. They run the catalogue's and the landing page
 * service on the admin's client, like every landing page tool; the uploader
 * is the shared picture uploader (`cover-uploader.ts`).
 */

const { width, height } = CATALOGUE_IMAGE_PURPOSES.landing_image;

const PICTURE_RULES = `A landing page picture is a landing page entry of Sogverse's picture catalogue, a ${width} × ${height} JPEG; many sections and pages may share one. A hero or text section shows one picture, an image section one to four; each needs alt text in every language before that language is complete. Placing a picture changes the working copy only: readers see it after the next publish.`;

const sectionId = z
  .guid()
  .describe("The section's id, as get_landing_page lists it.");

const pictureItemId = z
  .guid()
  .describe(
    "In an image section, the picture item to replace or remove, by its item id (not its catalogue id). Left out, a new picture is added at the end.",
  );

/** What placing a picture would make of a section, or why it cannot. */
function placed(
  section: LandingSection,
  imageId: string | null,
  pictureId: string | undefined,
): { section: LandingSection; pictureId: string | null } | { refusal: string } {
  if (section.type === "hero" || section.type === "text") {
    if (pictureId !== undefined) {
      return { refusal: `A ${section.type} section has one picture and no picture items: leave pictureId out.` };
    }
    return { section: { ...section, imageId: imageId ?? undefined }, pictureId: null };
  }
  if (section.type !== "image") {
    return { refusal: `A ${section.type} section has no picture.` };
  }
  if (pictureId === undefined) {
    if (imageId === null) {
      return { refusal: "Name the picture to remove with pictureId." };
    }
    if (section.images.length >= 4) {
      return { refusal: "An image section shows at most four pictures: replace one by its pictureId." };
    }
    const added = { id: crypto.randomUUID(), imageId };
    return { section: { ...section, images: [...section.images, added] }, pictureId: added.id };
  }
  if (!section.images.some((image) => image.id === pictureId)) {
    return { refusal: `The section has no picture item ${pictureId}.` };
  }
  if (imageId === null) {
    if (section.images.length === 1) {
      return {
        refusal:
          "An image section shows at least one picture: to remove its last, remove the section with save_landing_page_structure.",
      };
    }
    return {
      section: { ...section, images: section.images.filter((image) => image.id !== pictureId) },
      pictureId,
    };
  }
  return {
    section: {
      ...section,
      images: section.images.map((image) =>
        image.id === pictureId ? { ...image, imageId } : image,
      ),
    },
    pictureId,
  };
}

export function registerLandingImageTools(server: McpServer): void {
  server.registerTool(
    "list_landing_images",
    {
      title: "List landing page pictures",
      description: `The pictures a landing page's sections can show — the landing page entries of the picture catalogue, newest first, a page at a time — each with its catalogue id (what the sections and set_landing_section_image take), its label, its public URL, when it was uploaded and which pages show it, saying whether readers see it there now or only the working copy has it. Each is shown as a small picture too. ${PICTURE_RULES} A picture not in the catalogue yet is added with open_landing_image_uploader.`,
      inputSchema: z.object({
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("How many entries to skip, from the previous page's nextOffset. 0 by default."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_IMAGES_PER_RESULT)
          .optional()
          .describe(`How many entries this page shows, at most ${MAX_IMAGES_PER_RESULT}. 12 by default.`),
      }),
      annotations: READ_ONLY,
    },
    ({ offset = 0, limit = 12 }, ctx) =>
      asLandingAdmin(ctx, async ({ client }) => {
        const catalogue = new CatalogueImagesService(client);
        const [entries, usage] = await Promise.all([
          catalogue.listImages("landing_image"),
          catalogue.getUsage(),
        ]);
        const page = entries.slice(offset, offset + limit);
        const next = offset + page.length;
        return answerWithCovers(
          {
            total: entries.length,
            offset,
            nextOffset: next < entries.length ? next : null,
            pictures: page.map((entry) => ({
              catalogueId: entry.id,
              label: entry.label,
              publicUrl: catalogueImageUrl("landing_image", entry.path),
              uploadedAt: entry.created_at,
              usedBy: (usage[entry.id] ?? []).flatMap((user) =>
                user.kind === "landing-page"
                  ? [{ pageId: user.id, title: user.title, readersSeeIt: user.is_live }]
                  : [],
              ),
            })),
          },
          page.map((entry) => ({
            path: entry.path,
            caption: `Catalogue entry ${entry.id} ("${entry.label}"): ${catalogueImageUrl("landing_image", entry.path)}`,
          })),
          COVER_THUMBNAIL,
          "landing_image",
        );
      }),
  );

  server.registerTool(
    "set_landing_section_image",
    {
      title: "Place a picture in a landing page section",
      description: `Put a catalogue picture in one section of the page's structure, by its catalogue id from list_landing_images; nothing else in the structure or any language's words is touched. In a hero or text section it replaces the section's picture, and null removes it. In an image section, pictureId names the picture item to replace (or, with null, to remove); without it the picture is added at the end. The answer says which languages now lack the picture's alt text. ${PICTURE_RULES} An entry that is not a landing page picture, or has left the catalogue, is refused.`,
      inputSchema: z.object({
        pageId,
        sectionId,
        imageId: z
          .guid()
          .nullable()
          .describe("The catalogue id of a landing page picture, or null to remove one."),
        pictureId: pictureItemId.optional(),
      }),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const page = await service.getAdminPage(input.pageId);
        if (page === null) return refusal(NOT_FOUND);
        const { sections } = page.draft;
        const target = sections.find((section) => section.id === input.sectionId);
        if (target === undefined) {
          return refusal(`The page has no section ${input.sectionId}.`);
        }
        const result = placed(target, input.imageId, input.pictureId);
        if ("refusal" in result) return refusal(result.refusal);
        await service.saveStructure(
          input.pageId,
          sections.map((section) => (section === target ? result.section : section)),
        );
        const after = await service.getAdminPage(input.pageId);
        if (after === null) return refusal(NOT_FOUND);
        const prefix = `sections.${input.sectionId}.`;
        return answer({
          pageId: input.pageId,
          section: after.draft.sections.find((section) => section.id === input.sectionId) ?? null,
          pictureId: result.pictureId,
          // The alt text the picture still needs, per language.
          missingInSection: after.draft.versions.flatMap((version) => {
            const missing = version.missing.filter((path) => path.startsWith(prefix));
            return missing.length === 0 ? [] : [{ locale: version.locale, missing }];
          }),
          hasUnpublishedChanges: after.hasUnpublishedChanges,
        });
      }),
  );

  server.registerTool(
    "open_landing_image_uploader",
    {
      title: "Upload a landing page picture",
      description: `Show the admin an uploader, inside this chat, where they pick a picture from their device. It is cropped to the middle ${width}:${height} frame and saved as a ${width} × ${height} JPEG in Sogverse's picture catalogue; with a sectionId it is then placed in that section as set_landing_section_image would (pictureId as there), and without one it is only added to the catalogue. The picture never passes through you, and you are told the new catalogue id once it is stored. Use it when the admin wants a picture that is not in list_landing_images yet. Only AI apps that show MCP Apps views can upload; in any other the admin uploads in the Sogverse editor, whose link get_landing_page gives. ${PICTURE_RULES}`,
      inputSchema: z.object({
        pageId,
        sectionId: sectionId.optional(),
        pictureId: pictureItemId.optional(),
      }),
      annotations: READ_ONLY,
      _meta: UPLOADER_VIEW_META,
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const page = await service.getAdminPage(input.pageId);
        if (page === null) return refusal(NOT_FOUND);
        const title = page.draft.versions[0]?.title ?? "";
        if (input.sectionId !== undefined) {
          const target = page.draft.sections.find((s) => s.id === input.sectionId);
          if (target === undefined) return refusal(`The page has no section ${input.sectionId}.`);
          // Refused now, before the admin picks a picture, rather than after it is stored.
          const check = placed(target, crypto.randomUUID(), input.pictureId);
          if ("refusal" in check) return refusal(check.refusal);
        }
        const where =
          input.sectionId === undefined
            ? null
            : `section ${input.sectionId} of landing page ${input.pageId}`;
        const value = {
          pageId: input.pageId,
          title,
          sectionId: input.sectionId ?? null,
          uploader: uploaderOpening("landing_image", {
            heading: "Landing page picture",
            subject: title ? `For “${title}”` : "For this landing page",
            uploadTool: "upload_landing_image",
            place:
              input.sectionId === undefined
                ? null
                : {
                    tool: "set_landing_section_image",
                    arguments: {
                      pageId: input.pageId,
                      sectionId: input.sectionId,
                      ...(input.pictureId === undefined ? {} : { pictureId: input.pictureId }),
                    },
                    imageArgument: "imageId",
                    actionLabel: "Upload and place in the section",
                    done: "The picture is in the section. Readers see it after the next publish.",
                    outcome: `It is now in ${where}'s working copy; write its alt text in every language with save_landing_page_text, and readers see it after the next publish.`,
                  },
          }),
        };
        return {
          structuredContent: value,
          content: [
            {
              type: "text",
              text: `The picture uploader for "${title}" is shown to the admin. Wait for them to pick a picture; you will be told its catalogue id once it is stored${where === null ? "" : ` and placed in ${where}`}. If your app shows no uploader, it cannot render MCP Apps views: the admin can upload the picture in the Sogverse editor instead, or choose an existing one from list_landing_images.\n\n${JSON.stringify(value, null, 2)}`,
            },
          ],
        };
      }),
  );

  registerPictureUploadTool(server, {
    name: "upload_landing_image",
    title: "Store an uploaded landing page picture",
    description: `Called by the picture uploader alone. Adds a ${width} × ${height} JPEG to the picture catalogue as a landing page entry, or answers the entry that already holds these exact bytes. It does not place it in any section.`,
    purpose: "landing_image",
    run: (ctx, body) => asLandingAdmin(ctx, ({ client }) => body(client)),
  });
}

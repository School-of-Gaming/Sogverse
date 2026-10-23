import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { describeMissingWords } from "@/lib/landing-pages/describe-missing";
import {
  landingPictureDestination,
  type LandingPictureDestination,
} from "@/lib/landing-pages/picture-destination";
import {
  LANDING_PICTURE_PURPOSES,
  LANDING_PICTURE_SHAPES,
  describeLandingPictureShape,
  describeLandingPictureShapes,
  isLandingPicturePurpose,
  landingPictureShapeOf,
  landingPictureSize,
  orList,
  type LandingPictureShape,
} from "@/lib/landing-pages/picture-shapes";
import {
  LANDING_SECTIONS,
  LANDING_SECTION_TYPES,
  type LandingSection,
} from "@/lib/landing-pages/sections";
import {
  COVER_THUMBNAIL,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
} from "@/lib/mcp/cover-images";
import {
  UPLOADER_VIEW_META,
  uploaderOpening,
} from "@/lib/mcp/image-uploader";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { NOT_FOUND, asLandingAdmin, pageId } from "@/lib/mcp/landing-pages-call";
import { CatalogueImagesService } from "@/services/catalogue-images/catalogue-images.service";
import type { LandingPictures } from "@/services/landing-pages/landing-pages.contracts";
import type { CatalogueImagePurpose } from "@/types";

/*
 * A landing page's pictures: the image catalogue's landing picture entries —
 * one purpose per shape — a page's sections show, the write that puts one in
 * a section, and the uploader that adds a new one. They run the catalogue's
 * and the landing page service on the admin's client, like every landing page
 * tool; the uploader is the shared picture uploader (`image-uploader.ts`).
 */

/** Each shape with its stored size, `wide 16:9 (1600 × 900)`. */
const SHAPES_WITH_SIZES = orList(
  LANDING_PICTURE_SHAPES.map((shape) => {
    const { width, height } = landingPictureSize(shape);
    return `${describeLandingPictureShape(shape)} (${width} × ${height})`;
  }),
);

/** Which shapes each section type with pictures takes, from the section registry. */
const SECTION_SHAPES = LANDING_SECTION_TYPES.flatMap((type) => {
  const shapes: readonly LandingPictureShape[] = LANDING_SECTIONS[type].pictureShapes;
  if (shapes.length === 0) return [];
  const which =
    shapes.length === LANDING_PICTURE_SHAPES.length
      ? "any shape"
      : `${describeLandingPictureShapes(shapes)} only`;
  return [`${type}, ${which}`];
}).join("; ");

const PICTURE_RULES = `A landing page picture is an entry of Sogverse's picture catalogue in one of three shapes, each a JPEG of one exact size: ${SHAPES_WITH_SIZES}. The shape is the entry's for good: a replace keeps it. Many sections and pages may share one. A hero, text or guide section shows one picture, an image section one to four. Shapes by section: ${SECTION_SHAPES}. A hero's is wide because it is also the page's link preview. An image section's pictures must all be one shape, so its grid lines up: to change its shape, send all its pictures at once with save_landing_page_structure, or remove all but one and replace that one. Each picture needs alt text in every language before that language is complete. Placing a picture changes the working copy only: readers see it after the next publish.`;

const shape = z
  .enum(LANDING_PICTURE_SHAPES)
  .describe("Only pictures of this shape. Left out, every shape.");

/*
 * Ids are stored lowercase, and compared with `===`: an id an AI app sends in
 * capitals is lowercased first, as the registry's `landingId` does.
 */
const sectionId = z
  .guid()
  .toLowerCase()
  .describe("The section's id, as get_landing_page lists it.");

const pictureItemId = z
  .guid()
  .toLowerCase()
  .describe(
    "In an image section, the picture item to replace or remove, by its item id (not its catalogue id). Left out, a new picture is added at the end.",
  );

/** What placing a picture would make of a section, or why it cannot. */
function placed(
  section: LandingSection,
  imageId: string | null,
  pictureId: string | undefined,
): { section: LandingSection; pictureId: string | null } | { refusal: string } {
  if (section.type === "hero" || section.type === "text" || section.type === "guide") {
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

/** A shown picture's shape by its catalogue id, from a copy's derived pictures. */
function shapeIn(pictures: LandingPictures): (imageId: string) => LandingPictureShape | null {
  return (imageId) =>
    Object.hasOwn(pictures, imageId) ? landingPictureShapeOf(pictures[imageId].purpose) : null;
}

/** How a catalogue entry's shape is named, for a landing picture purpose. */
function shapeNameOf(purpose: CatalogueImagePurpose): string {
  return isLandingPicturePurpose(purpose)
    ? describeLandingPictureShape(landingPictureShapeOf(purpose))
    : purpose;
}

export function registerLandingImageTools(server: McpServer): void {
  server.registerTool(
    "list_landing_images",
    {
      title: "List landing page pictures",
      description: `The pictures a landing page's sections can show — the landing page entries of the picture catalogue, newest first, a page at a time, of every shape or of one — each with its catalogue id (what the sections and set_landing_section_image take), its shape, its label, its public URL, when it was uploaded and which pages show it, saying whether readers see it there now or only the working copy has it. Each is shown as a small picture too. ${PICTURE_RULES} A picture not in the catalogue yet is added with open_landing_image_uploader.`,
      inputSchema: z.object({
        shape: shape.optional(),
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
    ({ shape: only, offset = 0, limit = 12 }, ctx) =>
      asLandingAdmin(ctx, async ({ client }) => {
        const catalogue = new CatalogueImagesService(client);
        const shapes = only === undefined ? LANDING_PICTURE_SHAPES : [only];
        const [lists, usage] = await Promise.all([
          Promise.all(shapes.map((each) => catalogue.listImages(LANDING_PICTURE_PURPOSES[each]))),
          catalogue.getUsage(),
        ]);
        // Each list is newest first, the id breaking a tie; so is the whole.
        const entries = lists
          .flat()
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        const page = entries.slice(offset, offset + limit);
        const next = offset + page.length;
        return answerWithCovers(
          {
            total: entries.length,
            offset,
            nextOffset: next < entries.length ? next : null,
            pictures: page.map((entry) => ({
              catalogueId: entry.id,
              shape: shapeNameOf(entry.purpose),
              label: entry.label,
              publicUrl: catalogueImageUrl(entry.purpose, entry.path),
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
            purpose: entry.purpose,
            caption: `Catalogue entry ${entry.id} ("${entry.label}", ${shapeNameOf(entry.purpose)}): ${catalogueImageUrl(entry.purpose, entry.path)}`,
          })),
          COVER_THUMBNAIL,
        );
      }),
  );

  server.registerTool(
    "set_landing_section_image",
    {
      title: "Place a picture in a landing page section",
      description: `Put a catalogue picture in one section of the page's structure, by its catalogue id from list_landing_images; nothing else in the structure or any language's words is touched. In a hero or text section it replaces the section's picture, and null removes it. In an image section, pictureId names the picture item to replace (or, with null, to remove); without it the picture is added at the end. The answer says which languages now lack the picture's alt text. ${PICTURE_RULES} An entry that is not a landing page picture, has left the catalogue, or is a shape the section does not take is refused, saying which.`,
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
            const missing = version.missing
              .filter((path) => path.startsWith(prefix))
              .map((path) => describeMissingWords(path, after.draft.sections));
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
      description: `Show the admin an uploader, inside this chat, where they pick a picture from their device. The uploader never crops: it measures the picture and takes it as the shape it already is, within 1% — ${SHAPES_WITH_SIZES} — scaled to that shape's exact size as a JPEG and saved in Sogverse's picture catalogue; the admin does not choose a shape. With a sectionId it is then placed in that section as set_landing_section_image would (pictureId as there), and only the shapes that section takes are accepted; without one it is only added to the catalogue. A picture of no shape, or of a shape the section does not take, is refused and nothing is uploaded: you are told the picture's size and why. Explain that to the admin in plain words — they can crop the picture to an accepted shape themselves and pick it again — and never offer to pad, stretch or crop it on their behalf. The picture never passes through you, and you are told the new catalogue id once it is stored. Use it when the admin wants a picture that is not in list_landing_images yet. Only AI apps that show MCP Apps views can upload; in any other, tell the admin the picture has to be uploaded from an AI app that does, or choose one already in list_landing_images. ${PICTURE_RULES}`,
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
        const title = resolveTranslation(page.draft.versions, DEFAULT_LOCALE)?.title ?? "";
        let destination: LandingPictureDestination = { shapes: LANDING_PICTURE_SHAPES, rule: null };
        if (input.sectionId !== undefined) {
          const target = page.draft.sections.find((s) => s.id === input.sectionId);
          if (target === undefined) return refusal(`The page has no section ${input.sectionId}.`);
          // Refused now, before the admin picks a picture, rather than after it is stored.
          const check = placed(target, crypto.randomUUID(), input.pictureId);
          if ("refusal" in check) return refusal(check.refusal);
          destination = landingPictureDestination(
            target,
            input.pictureId,
            shapeIn(page.draft.pictures),
          );
        }
        const where =
          input.sectionId === undefined
            ? null
            : `section ${input.sectionId} of landing page ${input.pageId}`;
        const accepts = describeLandingPictureShapes(destination.shapes);
        const value = {
          pageId: input.pageId,
          title,
          sectionId: input.sectionId ?? null,
          accepts,
          uploader: uploaderOpening({
            heading: "Landing page picture",
            subject: title ? `For “${title}”` : "For this landing page",
            frames: LANDING_PICTURE_SHAPES.map((each) => ({
              purpose: LANDING_PICTURE_PURPOSES[each],
              name: describeLandingPictureShape(each),
              refusal: destination.shapes.includes(each) ? null : destination.rule,
            })),
            noFrame:
              destination.rule ??
              `A landing page picture must be ${describeLandingPictureShapes(LANDING_PICTURE_SHAPES)}.`,
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
              text: `The picture uploader for "${title}" is shown to the admin; it takes a picture that is already ${accepts}. Wait for them to pick one; you will be told its catalogue id once it is stored${where === null ? "" : ` and placed in ${where}`}, or, if it is refused, its size and why, to explain to the admin. If your app shows no uploader, it cannot render MCP Apps views: the admin can upload the picture from an AI app that does, or choose an existing one from list_landing_images.\n\n${JSON.stringify(value, null, 2)}`,
            },
          ],
        };
      }),
  );
}

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { describeMissingWords } from "@/lib/landing-pages/describe-missing";
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
  IMAGE_SECTION_MAX_PICTURES,
  LANDING_SECTIONS,
  LANDING_SECTION_TYPES,
  type LandingSection,
  type LandingSectionOf,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  COVER_THUMBNAIL,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
} from "@/lib/mcp/cover-images";
import { UPLOADER_VIEW_META, uploaderOpening } from "@/lib/mcp/image-uploader";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { NOT_FOUND, asLandingAdmin, pageId } from "@/lib/mcp/landing-pages-call";
import { CatalogueImagesService } from "@/services/catalogue-images/catalogue-images.service";
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

/**
 * The section types that show one picture, in an `imageId` of their own: the
 * types with pictures whose registry schema carries that field, where the
 * image section carries a list of picture items instead.
 */
type OnePictureType = {
  [Type in LandingSectionType]: "imageId" extends keyof LandingSectionOf<Type> ? Type : never;
}[LandingSectionType];

const ONE_PICTURE_TYPES = LANDING_SECTION_TYPES.filter(
  (type): type is OnePictureType =>
    LANDING_SECTIONS[type].pictureShapes.length > 0 && "imageId" in LANDING_SECTIONS[type].section.shape,
);

const ONE_PICTURE: ReadonlySet<LandingSectionType> = new Set(ONE_PICTURE_TYPES);

/** The one-picture types as an admin reads them, `hero, text or guide`. */
const ONE_PICTURE_NAMES = orList(ONE_PICTURE_TYPES);

function showsOnePicture(section: LandingSection): section is LandingSectionOf<OnePictureType> {
  return ONE_PICTURE.has(section.type);
}

const PICTURE_RULES = `A landing page picture is an entry of Sogverse's picture catalogue in one of three shapes, each a JPEG of one exact size: ${SHAPES_WITH_SIZES}. The shape is the entry's for good: a replace keeps it. Many sections and pages may share one. A ${ONE_PICTURE_NAMES} section shows one picture, an image section one to four. Shapes by section: ${SECTION_SHAPES}. A hero's is wide because it is also the page's link preview. An image section's pictures must all be one shape, so its grid lines up: to change its shape, send all its pictures at once with save_landing_page_structure, or remove all but one and replace that one. Each picture needs alt text in every language before that language is complete. Placing a picture changes the working copy only: readers see it after the next publish.`;

/**
 * What the model is told to do with pictures the uploader has added to the
 * catalogue, at the end of the batch's report: place them through the
 * placing tools, choosing by the section rules, where the database is the
 * final judge of whether a picture fits.
 */
const UPLOADED_NEXT_STEP = `Then place the uploaded pictures where the admin wants them: with set_landing_section_image — imageId for a ${ONE_PICTURE_NAMES} section, which shows one picture, or imageIds to add several to the end of an image section — or in a new section through save_landing_page_structure, choosing for each section only a shape it takes (${SECTION_SHAPES}; an image section's pictures all one shape), and write each one's alt text in every language with save_landing_page_text. A picture that does not fit where the admin wanted it stays in the catalogue, in list_landing_images, for another section: tell the admin so.`;

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
  if (showsOnePicture(section)) {
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
    if (section.images.length >= IMAGE_SECTION_MAX_PICTURES) {
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

/** How many more pictures an image section has room for. */
function roomLeft(section: LandingSectionOf<"image">): number {
  return Math.max(0, IMAGE_SECTION_MAX_PICTURES - section.images.length);
}

/** What adding several pictures at the end of a section would make of it, or why it cannot. */
function placedAll(
  section: LandingSection,
  imageIds: readonly string[],
): { section: LandingSection; pictureIds: string[] } | { refusal: string } {
  if (showsOnePicture(section)) {
    return { refusal: `A ${section.type} section has one picture: send imageId, not imageIds.` };
  }
  if (section.type !== "image") {
    return { refusal: `A ${section.type} section has no picture.` };
  }
  const room = roomLeft(section);
  if (imageIds.length > room) {
    return {
      refusal:
        room === 0
          ? "An image section shows at most four pictures, and this one has no room left: replace one by its pictureId."
          : `An image section shows at most four pictures, and this one has room for ${room} more.`,
    };
  }
  const added = imageIds.map((imageId) => ({ id: crypto.randomUUID(), imageId }));
  return {
    section: { ...section, images: [...section.images, ...added] },
    pictureIds: added.map((item) => item.id),
  };
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
      description: `Put a catalogue picture in one section of the page's structure, by its catalogue id from list_landing_images; nothing else in the structure or any language's words is touched. In a ${ONE_PICTURE_NAMES} section, which shows one picture, it replaces the section's picture, and null removes it. In an image section, pictureId names the picture item to replace (or, with null, to remove); without it the picture is added at the end. To add several pictures to the end of an image section in one write, send imageIds in place of imageId, in the order they are to show, as many as the section has room for; the answer then lists their new item ids as pictureIds, in the same order. The answer says which languages now lack the picture's alt text. ${PICTURE_RULES} An entry that is not a landing page picture, has left the catalogue, or is a shape the section does not take is refused, saying which.`,
      inputSchema: z.object({
        pageId,
        sectionId,
        imageId: z
          .guid()
          .nullable()
          .optional()
          .describe(
            "The catalogue id of a landing page picture, or null to remove one. Send this or imageIds.",
          ),
        imageIds: z
          .array(z.guid())
          .min(1)
          .max(IMAGE_SECTION_MAX_PICTURES)
          .optional()
          .describe(
            "In an image section, the catalogue ids of several landing page pictures to add at its end, in order, in place of imageId.",
          ),
        pictureId: pictureItemId.optional(),
      }),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        if ((input.imageId === undefined) === (input.imageIds === undefined)) {
          return refusal("Send imageId, or imageIds to add several pictures to an image section: one of the two.");
        }
        if (input.imageIds !== undefined && input.pictureId !== undefined) {
          return refusal("imageIds adds pictures at the end of the section: leave pictureId out.");
        }
        const page = await service.getAdminPage(input.pageId);
        if (page === null) return refusal(NOT_FOUND);
        const { sections } = page.draft;
        const target = sections.find((section) => section.id === input.sectionId);
        if (target === undefined) {
          return refusal(`The page has no section ${input.sectionId}.`);
        }
        const result =
          input.imageIds === undefined
            ? placed(target, input.imageId ?? null, input.pictureId)
            : placedAll(target, input.imageIds);
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
          ...("pictureIds" in result
            ? { pictureIds: result.pictureIds }
            : { pictureId: result.pictureId }),
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
      title: "Upload landing page pictures",
      description: `Show the admin an uploader, inside this chat, where they pick pictures from their device to add to Sogverse's picture catalogue as landing page pictures — as many as they like at once, from the file picker or by dropping them on it. It only adds them to the catalogue and places none: you place them afterwards. The uploader never crops: it measures each picture and takes it as the shape it already is, within 1% — ${SHAPES_WITH_SIZES} — scaled to that shape's exact size as a JPEG; the admin does not choose a shape. Each picture is judged on its own, and a refused one never holds back the others: a picture of none of those shapes is refused and not uploaded. Explain each refusal to the admin in plain words — they can crop a picture to one of the shapes themselves and pick it again, in the same uploader if the batch stored nothing and otherwise in a new one you open with open_landing_image_uploader — and never offer to pad, stretch or crop it on their behalf. The pictures never pass through you; once the admin has uploaded, you are told the whole batch at once, in the order picked: each uploaded picture's new catalogue id, label, shape and the file name it came from, and each refused file with why. ${UPLOADED_NEXT_STEP} Use it when the admin wants a picture that is not in list_landing_images yet — also when they ask for a section of their own photos, such as a gallery: upload first, then place the new ids. Only AI apps that show MCP Apps views can upload; in any other, tell the admin the picture has to be uploaded from an AI app that does, or choose one already in list_landing_images. ${PICTURE_RULES}`,
      inputSchema: z.object({}),
      annotations: READ_ONLY,
      _meta: UPLOADER_VIEW_META,
    },
    (_input, ctx) =>
      asLandingAdmin(ctx, async () => {
        const accepts = describeLandingPictureShapes(LANDING_PICTURE_SHAPES);
        const value = {
          accepts,
          uploader: uploaderOpening({
            heading: "Landing page pictures",
            subject: "Added to the picture catalogue, ready to place on any landing page",
            frames: LANDING_PICTURE_SHAPES.map((each) => ({
              purpose: LANDING_PICTURE_PURPOSES[each],
              name: describeLandingPictureShape(each),
            })),
            noFrame: `A landing page picture must be ${accepts}.`,
            nextStep: UPLOADED_NEXT_STEP,
          }),
        };
        return {
          structuredContent: value,
          content: [
            {
              type: "text",
              text: `The picture uploader is shown to the admin; it takes pictures that are already ${accepts}, as many as they like at once, and adds them to the picture catalogue. Wait for them to pick; you will be told the whole batch at once, in the order picked: each stored picture's catalogue id, label, shape and file name, and each refused file's size and why, to explain to the admin. ${UPLOADED_NEXT_STEP} If your app shows no uploader, it cannot render MCP Apps views: the admin can upload the picture from an AI app that does, or choose an existing one from list_landing_images.

${JSON.stringify(value, null, 2)}`,
            },
          ],
        };
      }),
  );
}

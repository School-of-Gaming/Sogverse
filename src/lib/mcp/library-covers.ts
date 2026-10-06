import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import {
  COVER_THUMBNAIL,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
  coverUrl,
} from "@/lib/mcp/cover-images";
import {
  UPLOADER_VIEW_META,
  registerPictureUploadTool,
  uploaderOpening,
} from "@/lib/mcp/image-uploader";
import {
  NOT_FOUND,
  OVERWRITES,
  READ_ONLY,
  answer,
  articleId,
  asAdmin,
  refusal,
} from "@/lib/mcp/library-call";
import { CatalogueImagesService } from "@/services/catalogue-images/catalogue-images.service";

/*
 * The Library's covers: the image catalogue's `library_cover` entries an
 * article's cover is chosen from, the write that sets one, and the uploader
 * that adds a new one. They run the catalogue's and the Library's own
 * services on the admin's client, like every Library tool; the uploader is
 * the shared picture uploader (`image-uploader.ts`).
 */

const COVER_RULES =
  "A cover is a Library cover entry of Sogverse's picture catalogue, a 1600 × 900 JPEG; many articles may share one. Setting it changes the article's working copy only: readers see the new cover after the next publish.";

export function registerLibraryCoverTools(server: McpServer): void {
  server.registerTool(
    "list_library_covers",
    {
      title: "List Library covers",
      description: `The pictures an article's cover can be set to — the Library cover entries of the picture catalogue, newest first, a page at a time — each with its catalogue id (what set_library_article_cover takes), its label, its public URL, when it was uploaded and which articles use it, saying whether readers see it as that article's cover now or only its working copy has it. Each is shown as a small picture too. ${COVER_RULES} A picture not in the catalogue yet is added with open_cover_uploader.`,
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
      asAdmin(ctx, async ({ client }) => {
        const catalogue = new CatalogueImagesService(client);
        const [entries, usage] = await Promise.all([
          catalogue.listImages("library_cover"),
          catalogue.getUsage(),
        ]);
        const page = entries.slice(offset, offset + limit);
        const next = offset + page.length;
        const covers = page.map((entry) => ({
          catalogueId: entry.id,
          label: entry.label,
          publicUrl: coverUrl(entry.path),
          uploadedAt: entry.created_at,
          usedBy: (usage[entry.id] ?? []).flatMap((user) =>
            user.kind === "library-article"
              ? [{ articleId: user.id, title: user.title, readersSeeIt: user.is_live }]
              : [],
          ),
        }));
        return answerWithCovers(
          {
            total: entries.length,
            offset,
            nextOffset: next < entries.length ? next : null,
            covers,
          },
          page.map((entry) => ({
            path: entry.path,
            caption: `Catalogue entry ${entry.id} ("${entry.label}"): ${coverUrl(entry.path)}`,
          })),
          COVER_THUMBNAIL,
        );
      }),
  );

  server.registerTool(
    "set_library_article_cover",
    {
      title: "Set a Library article's cover",
      description: `Set the article's cover to a catalogue entry, by its catalogue id from list_library_covers; null removes the cover. Nothing else is touched. ${COVER_RULES} An entry that is not a Library cover, or has been removed from the catalogue, is refused.`,
      inputSchema: z.object({
        articleId,
        coverImageId: z
          .guid()
          .nullable()
          .describe("The catalogue id of a Library cover entry, or null for no cover."),
      }),
      annotations: OVERWRITES,
    },
    ({ articleId: id, coverImageId }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        await service.setArticleCover(id, coverImageId);
        const article = await service.getAdminArticle(id);
        if (article === null) return refusal(NOT_FOUND);
        const { draft, publication } = article;
        return answer({
          articleId: id,
          cover:
            draft.coverImageId === null
              ? null
              : {
                  catalogueId: draft.coverImageId,
                  label: draft.coverLabel,
                  publicUrl: draft.coverPath === null ? null : coverUrl(draft.coverPath),
                },
          live: publication !== null,
          hasUnpublishedChanges: article.hasUnpublishedChanges,
        });
      }),
  );

  server.registerTool(
    "open_cover_uploader",
    {
      title: "Upload a Library cover",
      description:
        "Show the admin an uploader, inside this chat, where they pick a picture from their device to become the article's cover. It is cropped to the middle 16:9 and saved as a 1600 × 900 JPEG in Sogverse's picture catalogue, then set as the article's working-copy cover; readers see it after the next publish. The picture never passes through you, and you are told the new catalogue id once it is set. Use it when the admin wants a cover that is not in list_library_covers yet. Only AI apps that show MCP Apps views can upload; in any other the admin uploads in the Sogverse editor, whose link get_library_article gives.",
      inputSchema: z.object({ articleId }),
      annotations: READ_ONLY,
      _meta: UPLOADER_VIEW_META,
    },
    ({ articleId: id }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        const article = await service.getAdminArticle(id);
        if (article === null) return refusal(NOT_FOUND);
        const { draft } = article;
        const title = draft.versions[0]?.title ?? "";
        const value = {
          articleId: id,
          title,
          currentCover:
            draft.coverImageId === null
              ? null
              : {
                  catalogueId: draft.coverImageId,
                  label: draft.coverLabel,
                  publicUrl: draft.coverPath === null ? null : coverUrl(draft.coverPath),
                },
          uploader: uploaderOpening("library_cover", {
            heading: "Library cover",
            subject: title ? `For “${title}”` : "For this article",
            uploadTool: "upload_library_cover",
            place: {
              tool: "set_library_article_cover",
              arguments: { articleId: id },
              imageArgument: "coverImageId",
              actionLabel: "Upload and set as cover",
              done: "The cover is set. Readers see it after the next publish.",
              outcome: `It is now article ${id}'s working-copy cover; readers see it after the next publish.`,
            },
          }),
        };
        return {
          structuredContent: value,
          content: [
            {
              type: "text",
              text: `The cover uploader for "${value.title}" is shown to the admin. Wait for them to pick a picture; you will be told the new cover's catalogue id once it is set. If your app shows no uploader, it cannot render MCP Apps views: the admin can upload the cover in the Sogverse editor instead, or choose an existing one from list_library_covers.\n\n${JSON.stringify(value, null, 2)}`,
            },
          ],
        };
      }),
  );

  registerPictureUploadTool(server, {
    name: "upload_library_cover",
    title: "Store an uploaded Library cover",
    description:
      "Called by the picture uploader alone. Adds a 1600 × 900 JPEG to the picture catalogue as a Library cover entry, or answers the entry that already holds these exact bytes. It does not set any article's cover.",
    purpose: "library_cover",
    run: (ctx, body) => asAdmin(ctx, ({ client }) => body(client)),
  });
}

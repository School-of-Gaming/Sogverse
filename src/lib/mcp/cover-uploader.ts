import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  type McpServer,
} from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { coverUrl } from "@/lib/mcp/cover-images";
import {
  NOT_FOUND,
  READ_ONLY,
  answer,
  articleId,
  asAdmin,
  refusal,
} from "@/lib/mcp/library-call";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOGUE_IMAGE_MAX_BYTES } from "@/services/catalogue-images/catalogue-images.contracts";
import {
  findOrCreateCatalogueImage,
  resolveEntryLabel,
  sizeCapRefusal,
  vetCatalogueUpload,
} from "@/services/catalogue-images/catalogue-images.server";

/*
 * Uploading a Library cover from an AI app, through an MCP Apps view
 * (extension `io.modelcontextprotocol/ui`). The bytes of a picture must never
 * pass through the model — it would have to read and repeat them, and a
 * client refuses a result that large anyway — so the model only opens the
 * uploader, and the uploader, a page the AI app renders in a sandboxed frame,
 * reads the admin's file, crops it to the cover's exact size and hands the
 * JPEG to an app-only tool through the AI app's own connection. The view
 * never holds a token: the AI app makes the call with its grant, so the gate
 * in front of it is the endpoint's like any other call.
 *
 * The view is `packages/mcp-cover-uploader`, built to one HTML file that is
 * committed and served here as the resource.
 */

/** The view's address. Hosts may cache a view by it, so a breaking change to the view's protocol names a new one. */
export const COVER_UPLOADER_URI = "ui://sogverse/library-cover-uploader.html";

/** What MCP Apps calls an HTML view. */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * The built view, read from the workspace package that builds it.
 * `next.config.ts` names the file in `outputFileTracingIncludes`, since a
 * `process.cwd()` read is invisible to the tracer.
 */
const COVER_UPLOADER_HTML = join(
  process.cwd(),
  "packages",
  "mcp-cover-uploader",
  "dist",
  "cover-uploader.html",
);

/** Read once per server instance: the file only changes with a deploy. */
let cachedHtml: Promise<string> | null = null;

function uploaderHtml(): Promise<string> {
  cachedHtml ??= readFile(COVER_UPLOADER_HTML, "utf8");
  return cachedHtml;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * The largest JPEG the uploader may send. The catalogue's cap is 4 MB, but the
 * picture travels as base64 inside one JSON-RPC request, which the MCP SDK
 * refuses over its own 4 MB (Vercel's limit, 4.5 MB, sits above that): base64
 * spends four characters on three bytes, and the envelope is left 64 KB. A
 * 1600 × 900 JPEG is a few hundred kilobytes, so neither limit is near.
 */
export const MAX_UPLOAD_BYTES = Math.min(
  CATALOGUE_IMAGE_MAX_BYTES,
  Math.floor(((DEFAULT_MAX_REQUEST_BODY_SIZE - 64 * 1024) * 3) / 4),
);

export function registerCoverUploader(server: McpServer): void {
  server.registerResource(
    "Library cover uploader",
    COVER_UPLOADER_URI,
    {
      title: "Library cover uploader",
      description:
        "Where the admin picks a picture from their device to become a Library article's cover.",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: await uploaderHtml(),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
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
      _meta: {
        ui: { resourceUri: COVER_UPLOADER_URI },
        // The key hosts from before `ui.resourceUri` read.
        "ui/resourceUri": COVER_UPLOADER_URI,
      },
    },
    ({ articleId: id }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        const article = await service.getAdminArticle(id);
        if (article === null) return refusal(NOT_FOUND);
        const { draft } = article;
        const { width, height } = CATALOGUE_IMAGE_PURPOSES.library_cover;
        const value = {
          articleId: id,
          title: draft.versions[0]?.title ?? "",
          // What the uploader crops to and may send: the catalogue's rule, so
          // the view restates none of it.
          cover: { width, height, maxBytes: MAX_UPLOAD_BYTES },
          currentCover:
            draft.coverImageId === null
              ? null
              : {
                  catalogueId: draft.coverImageId,
                  label: draft.coverLabel,
                  publicUrl: draft.coverPath === null ? null : coverUrl(draft.coverPath),
                },
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

  server.registerTool(
    "upload_library_cover",
    {
      title: "Store an uploaded Library cover",
      description:
        "Called by the cover uploader alone. Adds a 1600 × 900 JPEG to the picture catalogue as a Library cover entry, or answers the entry that already holds these exact bytes. It does not set any article's cover.",
      inputSchema: z.object({
        fileName: z
          .string()
          .min(1)
          .max(255)
          .describe("The picture's file name, ending .jpg or .jpeg."),
        label: z
          .string()
          .max(500)
          .optional()
          .describe("The entry's label; the file name's stem when left out."),
        jpegBase64: z.string().describe("The JPEG's bytes, base64."),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        // The same bytes answer the same entry.
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: COVER_UPLOADER_URI, visibility: ["app"] },
        "ui/resourceUri": COVER_UPLOADER_URI,
      },
    },
    ({ fileName, label, jpegBase64 }, ctx) =>
      asAdmin(ctx, async ({ client }) => {
        const encoded = jpegBase64.replace(/\s+/g, "");
        // Measured from the text before it is decoded: four characters carry
        // three bytes, so an oversized picture costs no buffer.
        const overCap = sizeCapRefusal(Math.floor((encoded.length * 3) / 4));
        if (overCap) return refusal(overCap.error);
        if (encoded.length % 4 !== 0 || !BASE64.test(encoded)) {
          return refusal("The picture did not arrive as base64.");
        }
        const file = new File([Buffer.from(encoded, "base64")], fileName, {
          type: "image/jpeg",
        });

        const vetted = await vetCatalogueUpload(file, "library_cover");
        if ("status" in vetted) return refusal(vetted.error);

        // Storage on the service-role client, the one writer the buckets'
        // guarantees are kept behind, exactly as the catalogue's upload route
        // does it; the catalogue row on the admin's own client, where the
        // table's admin-only policy decides.
        const { status, image } = await findOrCreateCatalogueImage({
          db: client,
          admin: createAdminClient(),
          file,
          ext: vetted.ext,
          contentType: vetted.contentType,
          label: resolveEntryLabel(label ?? null, fileName),
          purpose: "library_cover",
        });
        return answer({
          status,
          cover: {
            catalogueId: image.id,
            label: image.label,
            publicUrl: coverUrl(image.path),
          },
        });
      }),
  );
}

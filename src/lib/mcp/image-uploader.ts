import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  type CallToolResult,
  type McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { answer, refusal } from "@/lib/mcp/library-call";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOGUE_IMAGE_MAX_BYTES } from "@/services/catalogue-images/catalogue-images.contracts";
import {
  findOrCreateCatalogueImage,
  resolveEntryLabel,
  sizeCapRefusal,
  vetCatalogueUpload,
} from "@/services/catalogue-images/catalogue-images.server";
import type { AppSupabaseClient, CatalogueImagePurpose } from "@/types";

/*
 * Uploading a catalogue picture from an AI app — a Library cover, a landing
 * page picture — through an MCP Apps view (extension
 * `io.modelcontextprotocol/ui`). The bytes of a picture must never pass
 * through the model — it would have to read and repeat them, and a client
 * refuses a result that large anyway — so the model only opens the uploader,
 * and the uploader, a page the AI app renders in a sandboxed frame, reads the
 * admin's file, crops it to the purpose's exact size and hands the JPEG to an
 * app-only tool through the AI app's own connection, then places it with the
 * tool the opening named. The view never holds a token: the AI app makes the
 * calls with its grant, so the gate in front of them is the endpoint's like
 * any other call.
 *
 * One view serves every purpose: what it uploads for, and how, arrives in the
 * opening tool's `uploader` field (`uploaderOpening`), so the view restates
 * nothing the catalogue or an area defines. It is
 * `packages/mcp-image-uploader`, built to one HTML file that is committed and
 * served here as the resource.
 */

/** The view's address. Hosts may cache a view by it, so a breaking change to the view's protocol names a new one. */
export const PICTURE_UPLOADER_URI = "ui://sogverse/picture-uploader.html";

/** What MCP Apps calls an HTML view. */
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** The `_meta` an opening tool carries, naming the view. */
export const UPLOADER_VIEW_META = {
  ui: { resourceUri: PICTURE_UPLOADER_URI },
  // The key hosts from before `ui.resourceUri` read.
  "ui/resourceUri": PICTURE_UPLOADER_URI,
};

/**
 * The built view, read from the workspace package that builds it.
 * `next.config.ts` names the file in `outputFileTracingIncludes`, since a
 * `process.cwd()` read is invisible to the tracer.
 */
const UPLOADER_HTML = join(
  process.cwd(),
  "packages",
  "mcp-image-uploader",
  "dist",
  "image-uploader.html",
);

/** Read once per server instance: the file only changes with a deploy. */
let cachedHtml: Promise<string> | null = null;

function uploaderHtml(): Promise<string> {
  cachedHtml ??= readFile(UPLOADER_HTML, "utf8");
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

/** Where the view puts a stored picture: a tool, its arguments, and the one the picture's id goes in. */
export interface UploaderPlacement {
  tool: string;
  arguments: Record<string, unknown>;
  imageArgument: string;
  /** The upload button's words. */
  actionLabel: string;
  /** What the view tells the admin once the picture is placed. */
  done: string;
  /** What the model is told once it is, after the entry's id and label. */
  outcome: string;
}

/**
 * What the view is opened with, in the opening tool's result as `uploader`:
 * the catalogue purpose, its exact size and the largest JPEG a call carries,
 * the app-only tool that stores it, and where it is placed — or null, when it
 * is only added to the catalogue and the model is told its id to place.
 */
export function uploaderOpening(
  purpose: CatalogueImagePurpose,
  view: {
    heading: string;
    subject: string;
    uploadTool: string;
    place: UploaderPlacement | null;
  },
) {
  const { width, height } = CATALOGUE_IMAGE_PURPOSES[purpose];
  return {
    purpose,
    heading: view.heading,
    subject: view.subject,
    frame: { width, height, maxBytes: MAX_UPLOAD_BYTES },
    uploadTool: view.uploadTool,
    place: view.place,
  };
}

/**
 * Register the app-only tool the view stores a picture of one purpose
 * through. It adds a JPEG exactly the purpose's size to the catalogue, or
 * answers the entry already holding the same bytes, and places it nowhere.
 * `run` is the area's own way of running a tool as the admin.
 */
export function registerPictureUploadTool(
  server: McpServer,
  tool: {
    name: string;
    title: string;
    description: string;
    purpose: CatalogueImagePurpose;
    run: (
      ctx: ServerContext,
      body: (client: AppSupabaseClient) => Promise<CallToolResult>,
    ) => Promise<CallToolResult>;
  },
): void {
  const { purpose } = tool;
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
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
        ui: { resourceUri: PICTURE_UPLOADER_URI, visibility: ["app"] },
        "ui/resourceUri": PICTURE_UPLOADER_URI,
      },
    },
    ({ fileName, label, jpegBase64 }, ctx) =>
      tool.run(ctx, async (client) => {
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

        const vetted = await vetCatalogueUpload(file, purpose);
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
          purpose,
        });
        return answer({
          status,
          image: {
            catalogueId: image.id,
            label: image.label,
            publicUrl: catalogueImageUrl(purpose, image.path),
          },
        });
      }),
  );
}

/**
 * Register the view itself, as the resource every opening tool names. The
 * opening and storing tools are each area's own (`library-covers.ts`,
 * `landing-pages-images.ts`).
 */
export function registerImageUploader(server: McpServer): void {
  server.registerResource(
    "Picture uploader",
    PICTURE_UPLOADER_URI,
    {
      title: "Picture uploader",
      description:
        "Where the admin picks a picture from their device to become a Library article's cover or a landing page's picture.",
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
}

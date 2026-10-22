import { createMcpHandler } from "mcp-handler";
import { registerAnalyticsTools } from "@/lib/mcp/analytics";
import { registerCoreTools } from "@/lib/mcp/core";
import { registerGuideTools } from "@/lib/mcp/guides";
import { registerImageUploader } from "@/lib/mcp/image-uploader";
import { registerLibraryTools } from "@/lib/mcp/library";
import { registerLandingPageTools } from "@/lib/mcp/landing-pages";
import { registerLandingImageTools } from "@/lib/mcp/landing-pages-images";
import { registerLibraryCoverTools } from "@/lib/mcp/library-covers";
import { registerProductTools } from "@/lib/mcp/products";
import { registerTestimonialTools } from "@/lib/mcp/testimonials";

/**
 * Sogverse's MCP server: one module per area, each registering its own tools.
 * An area added later is one more `register…` call here and nothing else — the
 * gate in front of the handler is the endpoint's, not any tool's.
 *
 * Stateless, as mcp-handler 2 serves it: every request builds a fresh server
 * from this factory, so no tool may keep state between calls.
 */
export function createSogverseMcpHandler(): (request: Request) => Promise<Response> {
  return createMcpHandler(
    (server) => {
      registerCoreTools(server);
      registerLibraryTools(server);
      registerLibraryCoverTools(server);
      registerImageUploader(server);
      registerLandingPageTools(server);
      registerLandingImageTools(server);
      registerTestimonialTools(server);
      registerGuideTools(server);
      registerAnalyticsTools(server);
      registerProductTools(server);
    },
    {
      serverInfo: { name: "sogverse", version: "1.0.0" },
      // The JSON-RPC method of every request, in the request's own log line:
      // Vercel records only the path, and a request that never finishes is
      // otherwise anonymous.
      onEvent: (event) => {
        if (event.type === "REQUEST_RECEIVED") console.info(`[mcp] ${event.method}`);
      },
      instructions:
        "Sogverse is School of Gaming's platform. This server acts as the signed-in School of Gaming admin. Call whoami first to confirm which environment you are connected to. The Library tools read, write and publish the parent-facing articles of the public Library, and choose, show and upload their covers. The landing page tools write, publish and unpublish the marketing landing pages on the public site, and choose, show and upload their pictures. list_products lists every product, as the admin product list does, and says which a landing page's products section shows. The testimonial tools keep the store of real words from parents, gamers and gedus that the site quotes: never write, invent or improve a testimonial's words — store what the admin supplies, translated faithfully where asked. The guide tools keep the store of PDFs the landing pages hand out, and upload them. The analytics tools read the site's traffic, by page and by campaign, as the admin Analytics page counts them.",
    },
  );
}

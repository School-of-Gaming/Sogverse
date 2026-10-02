import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * One self-contained HTML file: an MCP Apps view is served as a single
 * resource, and the host's default policy lets it load nothing from anywhere,
 * so every script and style is inlined. The output is committed
 * (`dist/cover-uploader.html`) and checked fresh by `npm run check-fresh`.
 */
export default defineConfig({
  root: import.meta.dirname,
  logLevel: "warn",
  plugins: [viteSingleFile()],
  // The SDK's packages each carry their own copy of zod 4; one is enough.
  resolve: { dedupe: ["zod"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "cover-uploader.html",
      onwarn(warning, warn) {
        // zod's sources place comments Rollup cannot read as annotations, and
        // says so for every one; it drops them, which changes nothing.
        if (warning.code === "INVALID_ANNOTATION") return;
        warn(warning);
      },
    },
  },
});

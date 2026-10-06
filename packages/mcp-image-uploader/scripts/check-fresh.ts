/**
 * Fails when the committed `dist/image-uploader.html` is not what the source
 * builds to now.
 *
 *     npm run check-fresh --workspace=@sog/mcp-image-uploader
 *
 * The built view is committed because the deployment never builds it: the
 * server reads the file as it is. That leaves one failure mode — a source
 * edited and never rebuilt, serving the old view — and this closes it, in CI
 * beside the other generated files' checks. It builds in memory and compares,
 * so running it never touches the working tree. Node strips the types and
 * runs this file directly.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  configFile: join(packageDir, "vite.config.ts"),
  logLevel: "silent",
  build: { write: false },
});
const outputs: Rollup.RollupOutput[] = Array.isArray(result)
  ? result
  : "output" in result
    ? [result]
    : [];
const html = outputs
  .flatMap((output) => output.output)
  .find((chunk) => chunk.fileName === "image-uploader.html");
if (html?.type !== "asset") {
  console.error("The build produced no image-uploader.html.");
  process.exit(1);
}

const committed = readFileSync(join(packageDir, "dist", "image-uploader.html"), "utf8");
if (String(html.source) !== committed) {
  console.error(
    "packages/mcp-image-uploader/dist/image-uploader.html is stale: run `npm run build --workspace=@sog/mcp-image-uploader` and commit the result.",
  );
  process.exit(1);
}
console.log("dist/image-uploader.html matches what the source builds to.");

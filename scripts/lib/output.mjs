/**
 * Where a script's working artifacts go: `scripts/output/<script-name>/`.
 *
 * The whole of `scripts/output/` is gitignored once, so a script never dumps
 * files in the repo root and never needs an ignore entry of its own. The folder
 * is resolved from this file's location rather than the working directory, so
 * running a script from anywhere lands its output in the same place, and each
 * script gets its own subfolder so two scripts' files never mix.
 *
 *   const OUTPUT = outputDir(import.meta.url);
 *   writeFileSync(path.join(OUTPUT, "report.json"), body);
 *
 * See `scripts/CLAUDE.md` for what counts as output and what does not.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_ROOT = path.join(import.meta.dirname, "..", "output");

/**
 * The calling script's output folder, created if it does not exist yet.
 *
 * `name` overrides the folder's name, for a tool that is a *directory* of
 * scripts rather than one file: `scripts/preview-export/export.mjs` wants its
 * artifacts under `output/preview-export/`, since `output/export/` names the
 * entry point rather than the tool that wrote them.
 */
export function outputDir(scriptUrl, name = null) {
  const folder =
    name ?? path.basename(fileURLToPath(scriptUrl)).replace(/\.[^.]+$/, "");
  const dir = path.join(OUTPUT_ROOT, folder);
  mkdirSync(dir, { recursive: true });
  return dir;
}

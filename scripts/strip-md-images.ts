/**
 * Strips base64 image references from markdown files in src/data/gedu-docs/.
 * Run once: npx tsx scripts/strip-md-images.ts
 */

import fs from "fs";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "src", "data", "gedu-docs");

const files = fs
  .readdirSync(DOCS_DIR)
  .filter((f) => f.toLowerCase().endsWith(".md"));

for (const filename of files) {
  const filePath = path.join(DOCS_DIR, filename);
  const original = fs.readFileSync(filePath, "utf-8");

  const cleaned = original
    // Remove [imageN]: <data:image/...> lines (Google Docs base64 embeds)
    .replace(/^\[image\d+\]:?\s*<data:image\/[^>]+>\s*$/gm, "")
    // Remove inline ![alt](data:image/...) references
    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, "")
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";

  const savedBytes = original.length - cleaned.length;
  fs.writeFileSync(filePath, cleaned);
  console.log(`${filename}: removed ${(savedBytes / 1024).toFixed(0)} KB of image data`);
}

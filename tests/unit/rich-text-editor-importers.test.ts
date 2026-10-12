import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A rich body written per locale is edited through the shared authored body
 * editor, and nowhere else.**
 *
 * The rich editor respells markdown in its own dialect and reports the
 * document on its first transaction whether or not anything was typed, so a
 * form that wires its `onChange` straight into its state reads an untouched
 * body as an unsaved change — and the editor reads its value once, at mount,
 * so a form that resets its state keeps showing what it threw away. The shared
 * authored body editor (`src/components/ui/authored-body-editor.tsx`) handles
 * both, through the body record the per-locale comparison reads. Every editor
 * of content written per locale reaching the rich editor any other way would
 * be that bug again, one editor at a time.
 *
 * The surface is every file under `src/` that imports the rich editor, found
 * on disk on every run — no pinned list — and every one of them has to be
 * classified here: the shared authored body editor itself, or a field that is
 * not content written per locale, with the reason. A new importer fails until
 * someone decides which it is; an entry whose file no longer imports the
 * editor fails until it is deleted.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * An import of the rich editor module by any specifier — alias or relative,
 * static or dynamic. The closing quote keeps its sibling modules
 * (`rich-text-editor-lines`) out.
 */
const IMPORTS_RICH_EDITOR = /["'][^"']*\/rich-text-editor["']/;

/** Where the rich editor itself lives: it is the module, not an importer. */
const THE_EDITOR = "src/components/ui/rich-text-editor.tsx";

type Classification =
  /** The one path per-locale rich bodies take. */
  | { readonly kind: "authoredBodyEditor" }
  /** A rich field that is not content written per locale. */
  | { readonly kind: "notPerLocale"; readonly reason: string }
  /**
   * A per-locale rich body that has not moved onto the shared editor yet.
   * Each entry is work queued, not an exemption: it is deleted by the change
   * that moves its editor over.
   */
  | { readonly kind: "notYetMigrated"; readonly reason: string };

const IMPORTERS: Readonly<Record<string, Classification>> = {
  "src/components/ui/authored-body-editor.tsx": { kind: "authoredBodyEditor" },
  "src/components/gedu/session-feed/RichNoteField.tsx": {
    kind: "notPerLocale",
    reason:
      "A gedu's session note or report: one text per session, written in whatever language the gedu writes in, with no language tabs and no saved copy to compare against.",
  },
  "src/app/[locale]/(dashboard)/admin/ui-components/page.tsx": {
    kind: "notPerLocale",
    reason: "The style guide's demo of the rich editor itself, over fixture text that is never saved.",
  },
  "src/components/admin/products/long-description-editor.tsx": {
    kind: "notYetMigrated",
    reason: "A product's long description, written per locale; moves onto the shared editor with the product form.",
  },
  "src/components/team/team-profile-form.tsx": {
    kind: "notYetMigrated",
    reason: "A team profile's bio, written per locale; moves onto the shared editor with the team profile form.",
  },
};

/** Every source file under `src/`, repo-relative with forward slashes. */
function sourceFiles(directory: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `src/` resolved against this file's own location, walked directory by directory; nothing here comes from outside the repo
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [relative(repoRoot, path).split(sep).join("/")] : [];
  });
}

const importers = sourceFiles(join(repoRoot, "src")).filter(
  (file) =>
    file !== THE_EDITOR &&
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the in-repo walk above
    IMPORTS_RICH_EDITOR.test(readFileSync(join(repoRoot, file), "utf8")),
);

describe("who imports the rich editor", () => {
  it("finds the importers", () => {
    expect(importers).toContain("src/components/ui/authored-body-editor.tsx");
  });

  it("classifies every file that imports it", () => {
    const unclassified = importers.filter((file) => !(file in IMPORTERS));
    expect(unclassified).toEqual([]);
  });

  it("classifies only files that still import it", () => {
    const stale = Object.keys(IMPORTERS).filter((file) => !importers.includes(file));
    expect(stale).toEqual([]);
  });

  it("has one authored body editor", () => {
    expect(
      Object.entries(IMPORTERS)
        .filter(([, classification]) => classification.kind === "authoredBodyEditor")
        .map(([file]) => file),
    ).toEqual(["src/components/ui/authored-body-editor.tsx"]);
  });
});

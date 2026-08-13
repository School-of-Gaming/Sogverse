import { describe, expect, it } from "vitest";
import { longDescriptionToMarkdown } from "@/lib/products/long-description-to-markdown";
import { LONG_DESCRIPTION_BLOCKS } from "@/components/public/products/mock-long-description-fixtures";
import {
  preflightFailure,
  restoreSql,
  sqlLiteral,
} from "../../../scripts/lib/long-description-export";
import type { ProductLongDescription } from "@/types";

/**
 * **The export's own safety net, which nothing else would catch failing.**
 *
 * The migration clears the long descriptions and they come back from the export
 * script's restore file. Before writing that file the script re-renders every
 * converted value and refuses to emit anything if the words or the headings
 * moved — which is the last check standing between real marketing copy and a
 * silent rewrite. A pre-flight that has quietly stopped comparing anything
 * passes every row, so it needs a case that is *supposed* to fail as much as it
 * needs one that passes.
 *
 * The conversion itself is pinned elsewhere, twice over. What is pinned here is
 * the checking and the quoting: the two pieces of the export that only exist in
 * the script, and the two whose failure is invisible until it has overwritten
 * production copy.
 */

function heading(text: string): ProductLongDescription[number] {
  return { type: "heading", text };
}

function paragraph(text: string): ProductLongDescription[number] {
  return { type: "paragraph", text };
}

describe("the pre-flight passes copy the conversion handled", () => {
  it("passes a whole product's worth of real copy", () => {
    const markdown = longDescriptionToMarkdown(LONG_DESCRIPTION_BLOCKS, 1);
    expect(preflightFailure(LONG_DESCRIPTION_BLOCKS, markdown)).toBeNull();
  });

  /**
   * The cases the escaping exists for: text that was plain and would otherwise
   * start meaning something in markdown. If the pre-flight rejected these it
   * would block a release over copy that is in fact fine.
   */
  it("passes text that reads as markdown syntax", () => {
    for (const text of [
      "A hidden 3 * 3 piston door * built twice",
      "the profile called latest_release _ again",
      "See [the handbook] for the [full] list",
      "the path is C:\\Users\\minecraft",
      "What to have ready:\n- a computer\n- a headset",
      "The server runs:\n1.21 and later, nothing older",
      "A line\n---",
      "mail us at <help@sog.gg> any time",
    ]) {
      const blocks = [heading("Ready?"), paragraph(text)];
      const markdown = longDescriptionToMarkdown(blocks, 1);
      expect(preflightFailure(blocks, markdown), text).toBeNull();
    }
  });

  it("passes copy whose only difference is whitespace the conversion drops", () => {
    // Leading indentation is stripped and a run of blank lines collapses to
    // one break — both known, both deliberate, and neither a change to the
    // words, so the check has to look past them.
    const blocks = [paragraph("    Indented line.\n\n\n\nAnd another.")];
    const markdown = longDescriptionToMarkdown(blocks, 1);
    expect(preflightFailure(blocks, markdown)).toBeNull();
  });
});

describe("the pre-flight catches a conversion that changed the copy", () => {
  it("fails when a word is missing from the rendered output", () => {
    const blocks = [paragraph("Bring a headset and a mouse.")];
    const failure = preflightFailure(blocks, "Bring a headset.");
    expect(failure).not.toBeNull();
    expect(failure).toContain("the rendered words differ");
  });

  it("fails when text silently acquired formatting", () => {
    // Exactly the failure the escaping prevents: passed through unescaped, the
    // stars become emphasis and vanish off the page, so the reader no longer
    // sees what the admin typed.
    const blocks = [paragraph("Use *stars* for the build queue")];
    const failure = preflightFailure(blocks, "Use *stars* for the build queue");
    expect(failure).not.toBeNull();
    expect(failure).toContain("the rendered words differ");
  });

  it("fails when a heading is lost, gained or reordered", () => {
    const blocks = [heading("First"), paragraph("Body."), heading("Second")];
    for (const markdown of [
      "# First\n\nBody.",
      "# First\n\nBody.\n\n# Second\n\n# Third",
      "# Second\n\nBody.\n\n# First",
    ]) {
      const failure = preflightFailure(blocks, markdown);
      expect(failure, markdown).not.toBeNull();
    }
  });

  it("fails when a heading became body copy", () => {
    // The words all survive, so only the heading half of the check sees this.
    const blocks = [heading("What happens"), paragraph("We build things.")];
    const failure = preflightFailure(blocks, "What happens\n\nWe build things.");
    expect(failure).toContain("the headings differ");
  });
});

describe("the restore SQL quotes values exactly", () => {
  it("doubles a single quote and leaves everything else alone", () => {
    expect(sqlLiteral("it's fine")).toBe("'it''s fine'");
    // Newlines, backslashes and non-ASCII are literal under
    // standard-conforming strings, which the emitted file asserts.
    expect(sqlLiteral("a\nb\\c äö 漢字")).toBe("'a\nb\\c äö 漢字'");
  });

  it("emits one keyed statement per row inside one asserted transaction", () => {
    const sql = restoreSql(
      [
        { product_id: "p1", locale: "en", markdown: "# One\n\nIt's here." },
        { product_id: "p2", locale: "fi", markdown: "# Kaksi" },
      ],
      "production",
      "2026-08-13T00:00:00.000Z",
    );
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain(
      "   SET long_description = '# One\n\nIt''s here.'\n WHERE product_id = 'p1'\n   AND locale = 'en';",
    );
    expect(sql.match(/^UPDATE public\.product_translations$/gm)).toHaveLength(2);
    // The count the transaction refuses to commit without.
    expect(sql).toContain("IF v_restored <> 2 THEN");
  });
});

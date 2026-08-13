/**
 * The pure half of `scripts/export-long-descriptions.tsx`: convert a stored
 * long description, check the conversion, and emit the restore SQL.
 *
 * Split from the command so it holds still under test. The command owns the
 * arguments, the credentials, the database read and the files; nothing here
 * touches any of those, which is what lets the pre-flight — the one piece whose
 * silent failure would be worst, because a broken check approves everything —
 * be exercised without a database.
 *
 * **What the pre-flight verifies.** Per row, it renders the converted markdown
 * through the product page's own renderer and compares two things against the
 * source blocks: the **visible words**, and the **headings** in count, order and
 * text. Whitespace is collapsed on both sides, deliberately: the conversion is
 * knowingly lossy about whitespace (leading indentation is stripped, a run of
 * blank lines becomes one break) and exact about words, so words are what there
 * is to compare.
 *
 * **What it does not verify.** Styling, spacing, and how the copy survives a
 * later save through the rich-text editor. Those are covered by the
 * conversion's own two test suites, which are the reason the conversion is
 * trusted at all; this is a safety net over data nobody has read, not a second
 * copy of them.
 */

import { renderToStaticMarkup } from "react-dom/server";

import { Markdown } from "@/components/ui/markdown";
import type { ProductLongDescription } from "@/types";

/**
 * The five characters React escapes on the way out, and nothing else — so
 * decoding exactly these recovers the text the renderer put on the page.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
};

function decodeEntities(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|#x27);/g, (m) => ENTITIES[m]);
}

/**
 * The words a reader sees, with whitespace collapsed. Every tag becomes a
 * space before collapsing, which is what makes a paragraph boundary and a
 * `<br>` read as the newline they came from.
 */
function visibleWords(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(
    <Markdown variant="marketing">{markdown}</Markdown>,
  );
}

/** Heading text in document order. A level-1 heading renders as `h2`. */
function renderedHeadings(html: string): string[] {
  return [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
    visibleWords(m[1]),
  );
}

function sourceWords(blocks: ProductLongDescription): string {
  return blocks
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceHeadings(blocks: ProductLongDescription): string[] {
  return blocks
    .filter((b) => b.type === "heading")
    .map((b) => b.text.replace(/\s+/g, " ").trim())
    .filter((text) => text !== "");
}

/** What is wrong with a converted row, or `null` when nothing is. */
export function preflightFailure(
  blocks: ProductLongDescription,
  markdown: string,
): string | null {
  const html = renderMarkdown(markdown);

  const expected = sourceWords(blocks);
  const actual = visibleWords(html);
  if (actual !== expected) {
    return `the rendered words differ from the stored text\n    stored:   ${expected}\n    rendered: ${actual}`;
  }

  const expectedHeadings = sourceHeadings(blocks);
  const actualHeadings = renderedHeadings(html);
  if (
    expectedHeadings.length !== actualHeadings.length ||
    expectedHeadings.some((text, i) => text !== actualHeadings[i])
  ) {
    return `the headings differ\n    stored:   ${JSON.stringify(expectedHeadings)}\n    rendered: ${JSON.stringify(actualHeadings)}`;
  }

  return null;
}

export interface ConvertedRow {
  product_id: string;
  locale: string;
  markdown: string;
}

/**
 * A Postgres string literal. Doubling the quote is exact for newlines,
 * backslashes and non-ASCII under standard-conforming strings, which the
 * emitted file sets transaction-locally rather than assuming.
 */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The restore: one UPDATE per row keyed on product_id and locale, in one
 * transaction that ends by asserting that **every exported row** came out
 * carrying a description. A row the UPDATEs missed — deleted since the export,
 * or its locale changed — rolls the whole thing back rather than leaving half
 * the catalogue restored.
 *
 * The assertion is keyed to the exported rows, not a whole-table count, so a
 * description an admin writes between the migration and the restore does not
 * abort the transaction (the staleness warning in the runbook still applies to
 * rows that *were* exported). That also makes the file safe to run again: on
 * failure nothing was committed, and after success the same UPDATEs write the
 * same values.
 *
 * Both `SET LOCAL`s live inside the transaction on purpose. The runbook's psql
 * command goes through the connection pooler in transaction mode, where a
 * session-level `SET` issued before `BEGIN` is not guaranteed to reach the
 * backend that serves the transaction — `SET LOCAL` after `BEGIN` is. The
 * `client_encoding` one is what keeps non-ASCII copy (ä, ö, –) intact when
 * psql's own default encoding came from a Windows console codepage.
 */
export function restoreSql(
  rows: ConvertedRow[],
  target: string,
  at: string,
): string {
  const statements = rows.map(
    (row) =>
      `UPDATE public.product_translations\n   SET long_description = ${sqlLiteral(row.markdown)}\n WHERE product_id = ${sqlLiteral(row.product_id)}\n   AND locale = ${sqlLiteral(row.locale)};`,
  );
  const keyList = rows
    .map(
      (row) => `      (${sqlLiteral(row.product_id)}, ${sqlLiteral(row.locale)})`,
    )
    .join(",\n");
  return [
    `-- Restores the product long descriptions, converted to markdown.`,
    `--`,
    `-- Exported from ${target} at ${at}, by scripts/export-long-descriptions.tsx.`,
    `-- Run it once, through psql, after the release carrying the migration has`,
    `-- been promoted. The procedure is docs/long-description-markdown-release.md.`,
    `--`,
    `-- ${rows.length} row(s).`,
    ``,
    `BEGIN;`,
    ``,
    `SET LOCAL client_encoding = 'UTF8';`,
    `SET LOCAL standard_conforming_strings = on;`,
    ``,
    ...statements.flatMap((s) => [s, ``]),
    `DO $$`,
    `DECLARE`,
    `  v_missing INTEGER;`,
    `BEGIN`,
    `  SELECT count(*) INTO v_missing`,
    `    FROM (VALUES`,
    keyList,
    `    ) AS exported(product_id, locale)`,
    `    LEFT JOIN public.product_translations t`,
    `      ON t.product_id::text = exported.product_id`,
    `     AND t.locale = exported.locale`,
    `   WHERE t.long_description IS NULL;`,
    `  IF v_missing <> 0 THEN`,
    `    RAISE EXCEPTION`,
    `      'Restore left % of the ${rows.length} exported row(s) without a long description — nothing has been committed.',`,
    `      v_missing;`,
    `  END IF;`,
    `END $$;`,
    ``,
    `COMMIT;`,
    ``,
  ].join("\n");
}

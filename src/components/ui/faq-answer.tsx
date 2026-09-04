import type { ReactNode } from "react";

/**
 * The block vocabulary an FAQ answer is written in, shared by every FAQ on the
 * site — the About page's and the three role dashboards'.
 *
 * **An answer's block structure lives in the message, not in the component.**
 * The renderer used to wrap each answer in one hardcoded `<p>`, which made
 * "break this into paragraphs" a code change and a numbered list impossible to
 * express at all. Now the catalog says where the paragraphs fall, so a locale
 * can break its own copy where its own sentences want breaking — which is not
 * always where English's do, since a translated answer routinely merges or
 * splits a sentence.
 *
 * **Every answer is fully tagged: there is no untagged fallback.** A bare
 * string still renders — `t.rich` hands back the text when a message carries no
 * tags — and that is precisely why the rule is worth stating, because the
 * failure is invisible: a single-paragraph answer missing its `<p>` looks
 * right and quietly loses its block semantics. The block-structure test over
 * the catalogs is what actually holds the line.
 *
 * The vocabulary is deliberately small, and is exactly what the copy uses:
 * paragraphs, a numbered list for instructions to follow in order, and a
 * bulleted list for a set with no order to it. Anything wider is a decision to
 * make when copy needs it, not a set of tags to keep warm.
 */
export const FAQ_ANSWER_TAGS = {
  p: (chunks: ReactNode) => <p>{chunks}</p>,

  /**
   * Instructions in order — "open this, then tap that". The marker is the
   * step number, so it carries meaning and is styled to be readable rather
   * than decorative.
   */
  steps: (chunks: ReactNode) => (
    <ol className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-foreground">
      {chunks}
    </ol>
  ),
  step: (chunks: ReactNode) => <li className="pl-1">{chunks}</li>,

  /** An unordered set — the things we hold about a child, and the like. */
  list: (chunks: ReactNode) => (
    <ul className="list-disc space-y-2 pl-6 marker:text-muted-foreground">{chunks}</ul>
  ),
  item: (chunks: ReactNode) => <li className="pl-1">{chunks}</li>,
} as const;

/**
 * An inline code span: text a reader has to reproduce exactly — a command to
 * type, a field name, an enum value, a literal — set in the machine face on a
 * lifted chip, inside a run of ordinary prose.
 *
 * Sized relative to the sentence around it (`0.875em`), because a monospace at
 * the prose's own size reads larger than the sans beside it; so the same span
 * fits a body paragraph and an extra-small field hint alike.
 *
 * The chip's vertical padding is a hairline, and a run of prose holding several
 * of them carries `leading-relaxed`: an inline background does not push lines
 * apart, so a chip taller than its line box overlaps the one on the next line
 * the moment a sentence wraps. `box-decoration-clone` keeps both ends of the
 * chip drawn when the text itself breaks across lines.
 *
 * In translated copy the span is marked with a `<code>` rich tag and rendered
 * through {@link codeTag}, so every locale marks the same words.
 */
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="box-decoration-clone rounded bg-lifted px-1.5 py-px font-mono text-[0.875em]">
      {children}
    </code>
  );
}

/** The `code` handler for `t.rich`: `t.rich(key, { code: codeTag })`. */
export function codeTag(chunks: React.ReactNode) {
  return <InlineCode>{chunks}</InlineCode>;
}

/**
 * Flatten a rich-text catalog message to plain text.
 *
 * FAQ answers are authored as tagged messages — `<p>`, `<list>`, `<item>` and
 * friends from the shared answer vocabulary — plus ICU-style value
 * placeholders like `{supportEmail}` that the rendering component supplies.
 * Two consumers need the same words with none of that markup: the `llms.txt`
 * body, which is plain text by definition, and the `FAQPage` structured data,
 * whose `acceptedAnswer.text` is read by machines rather than laid out.
 *
 * Writing that flattening twice is how the two would drift, so it is one pure
 * function taking the message and the same values the component passes.
 *
 * **Every tag becomes a single space, not nothing.** The tags in these messages
 * are block-level: dropping `</p><p>` outright would run the last word of one
 * paragraph into the first word of the next. A space at every boundary keeps
 * the sentences apart, and the whitespace collapse below means an inline tag
 * inside a sentence costs nothing.
 *
 * Placeholders the caller did not supply are left as written. This runs inside
 * a publicly cached response and a page's metadata: a literal `{foo}` in a
 * search snippet is a visible defect somebody fixes, and throwing here would
 * take the page with it.
 */
export function messageToPlainText(
  message: string,
  values: Readonly<Record<string, string>> = {},
): string {
  return message
    .replace(/<\/?[A-Za-z][A-Za-z0-9]*\s*\/?>/g, " ")
    .replace(/\{(\w+)\}/g, (literal, name: string) => values[name] ?? literal)
    .replace(/\s+/g, " ")
    .trim();
}

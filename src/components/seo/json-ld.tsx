/**
 * One block of schema.org structured data, serialised into the page.
 *
 * **The escaping is the whole component.** A `<script type="application/ld+json">`
 * block ends at the first literal `</script>` in its text — the HTML parser is
 * looking for that string, not for JSON — so a product name an admin typed
 * containing one would close the block early and put whatever follows into the
 * document as markup. `JSON.stringify` does not help: `<` is a perfectly legal
 * JSON character and comes out verbatim. Escaping `<`, `>` and `&` into
 * their `\u003c`-style JSON escapes is the standard fix — an escape is the same
 * string to a JSON parser and cannot spell a tag to an HTML one — and it is applied
 * here, once, so no caller has to remember it. Everything upstream of this
 * component may treat its data as ordinary values.
 *
 * **It needs no CSP nonce, and must not be given one.** `application/ld+json`
 * is a data block: the browser never executes it, and `script-src` (`src/proxy.ts`)
 * governs execution, so the policy has nothing to say about it. Nothing in
 * `tests/smoke/` asserts on inline scripts either — the smoke check reads the
 * CSP header, not the document — so this adds no obligation there. The
 * `src/CLAUDE.md` rule against inline `<script>` tags is about scripts that
 * run; this is the exception it does not cover, which is why the reasoning is
 * written here rather than assumed.
 *
 * `dangerouslySetInnerHTML` is required rather than chosen: React escapes text
 * children as HTML text, which would turn every `"` in the JSON into `&quot;`
 * and hand a consumer something that is no longer JSON.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

/** The escaped JSON text `JsonLd` embeds — exported so it can be tested directly. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

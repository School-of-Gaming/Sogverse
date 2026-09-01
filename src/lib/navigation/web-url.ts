/**
 * Whether a stored string may become the `href` of an anchor — and, when it
 * may, exactly what that `href` should be.
 *
 * The outward-facing sibling of `resolveInternalPath` beside it: that one
 * resolves a caller-supplied target to a path *inside* the app, this one
 * decides whether a value is a link *off* it we are willing to render at all.
 * Both exist so the check is written once rather than re-derived per surface.
 *
 * **The scheme allow-list is the part doing the security work.** `new URL()`
 * alone accepts `javascript:alert(1)`, `data:text/html,…` and `vbscript:…` as
 * perfectly valid URLs, so parseability on its own is a stored-XSS hole with an
 * extra step anywhere the value arrived from a text field somebody typed into.
 * It is an allow-list rather than a block-list of the schemes we happen to know
 * are dangerous, because the browser knows more schemes than we do and the next
 * one will not announce itself.
 *
 * **What comes back is the parser's own serialization, never the input.**
 * Whatever an anchor is handed has to be the exact string that was checked: the
 * URL parser strips leading and trailing whitespace and control characters,
 * normalizes backslashes and re-encodes the host, so passing the raw value
 * through to the `href` would put a *different* string in the DOM than the one
 * the scheme test ran against.
 *
 * **`null` is the whole of the failure answer, and an empty string is never
 * returned** — an anchor with a blank `href` is not inert, it resolves to the
 * current page. A caller that gets `null` must render no anchor at all.
 */
export function resolveWebUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? parsed.href
    : null;
}

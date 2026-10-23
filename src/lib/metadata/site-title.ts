/**
 * **The `<title>` template every sub-page's title goes through**: the root
 * layout's `title.template`, so a page that names itself `Shop` is served as
 * `Shop | School of Gaming`. The brand alone rather than the lockup, because a
 * tab is read while scanning a row of them for the name the reader came for.
 *
 * The layout hands it to Next, and `siteDocumentTitle` applies it the way Next
 * does — `%s` replaced by the page's own title — for anything that has to say
 * what a page's `<title>` will be without rendering it.
 */
export const SITE_TITLE_TEMPLATE = "%s | School of Gaming";

/** The `<title>` a page whose own title is `title` is served with. */
export function siteDocumentTitle(title: string): string {
  return SITE_TITLE_TEMPLATE.replace("%s", () => title);
}

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonLd, serializeJsonLd } from "@/components/seo/json-ld";

/**
 * The one thing this component exists to do: stop a value that came from
 * somewhere else — an admin-authored product name, most concretely — from
 * ending the `<script>` block it is being written into.
 *
 * Rendered rather than asserted on the serializer alone, because the escaping
 * only matters as it reaches the document, and it is the document a parser
 * reads.
 */
describe("JsonLd", () => {
  const hostile = { name: 'Club </script><img src=x onerror="alert(1)">' };

  it("never emits a literal closing script tag from the data", () => {
    const html = renderToStaticMarkup(JsonLd({ data: hostile }));

    // Exactly one `</script>`: the real one that ends the block.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html.endsWith("</script>")).toBe(true);
  });

  it("emits no angle bracket or ampersand from the data at all", () => {
    // Stronger than checking for `</script>` alone, and it is the check that
    // survives someone finding a spelling of the tag we did not think of: if
    // no `<` from the payload reaches the document, no tag can be spelled.
    const body = renderToStaticMarkup(JsonLd({ data: hostile }))
      .replace(/^<script type="application\/ld\+json">/, "")
      .replace(/<\/script>$/, "");

    expect(body).not.toMatch(/[<>&]/);
  });

  it("still parses back as the data it was given", () => {
    // The escapes have to be JSON escapes, not mangling: a consumer reading
    // this block must get the admin's name back exactly as it was typed.
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });

  it("declares the ld+json type", () => {
    const html = renderToStaticMarkup(JsonLd({ data: { "@type": "Organization" } }));

    expect(html).toContain('type="application/ld+json"');
  });
});

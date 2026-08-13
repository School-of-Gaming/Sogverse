import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";

/**
 * **A product's marketing long description, on the shop detail page.**
 *
 * One authored markdown string: a heading carries a real level, a list is a
 * list, and an admin can link out to the game's own store page or back to one
 * of our policies. The card is omitted entirely when the field is blank, which
 * is the ordinary state for most products.
 *
 * `marketing` is the field's variant, not the reader's: it is what makes links
 * survive and gives headings a page-level scale, and every surface rendering
 * this field passes the same one.
 *
 * The caller hands over markdown, never the raw column — the stored value is
 * still `jsonb` and may be either shape, and the one place that decides is the
 * normalisation in `src/lib/products/`.
 */
export function LongDescription({ markdown }: { markdown: string }) {
  if (markdown.trim() === "") return null;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <Markdown variant="marketing" className="text-muted-foreground">
          {markdown}
        </Markdown>
      </CardContent>
    </Card>
  );
}

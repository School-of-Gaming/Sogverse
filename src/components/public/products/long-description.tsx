import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import type { ProductLongDescription } from "@/types";

// Renders a product's structured long description on the shop detail page: the
// flat block array (see migration 00091) mapped top-to-bottom to semantic
// headings and paragraphs. The whole card is omitted when there are no blocks
// (the optional field is unset for this locale). Both render paths for the
// field live in this file — the block one below and the markdown one that is
// replacing it — so the format change stays localized here.
//
// `whitespace-pre-line` on paragraphs keeps any intentional line breaks the
// admin typed inside a single block.
//
// Vertical rhythm is set per block (not via a container `space-y`, which would
// fight these margins): paragraphs sit a tight `mt-2` apart, headings get a
// roomier `mt-5` so each section stands clear of the one above. `first:mt-0`
// drops the leading gap on whichever block opens the card.

export function LongDescription({ blocks }: { blocks: ProductLongDescription }) {
  if (blocks.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        {blocks.map((block, i) =>
          block.type === "heading" ? (
            <h2
              key={i}
              className="mt-5 text-base font-semibold text-foreground first:mt-0"
            >
              {block.text}
            </h2>
          ) : (
            <p
              key={i}
              className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground first:mt-0"
            >
              {block.text}
            </p>
          ),
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The same card, over a **markdown** long description.
 *
 * The format the field is moving to: one authored string instead of a block
 * array, so a heading carries a real level, a list is a list, and an admin can
 * link out to the game's own store page or back to one of our policies.
 *
 * Everything around the text is deliberately identical to the block card above
 * — same card, same padding, same place on the page, same type scale and the
 * same muted body against darker headings — because the two have to be
 * comparable side by side while the format is being chosen. What differs is the
 * text and only the text.
 *
 * `marketing` is the field's variant, not the reader's: it is what makes links
 * survive and gives headings a page-level scale, and every surface rendering
 * this field passes the same one. A blank value renders nothing at all, exactly
 * as an empty block array does.
 */
export function LongDescriptionMarkdown({ markdown }: { markdown: string }) {
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

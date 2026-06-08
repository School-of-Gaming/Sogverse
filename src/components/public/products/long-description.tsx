import { Card, CardContent } from "@/components/ui/card";
import type { ProductLongDescription } from "@/types";

// Renders a product's structured long description on the shop detail page: the
// flat block array (see migration 00091) mapped top-to-bottom to semantic
// headings and paragraphs. The whole card is omitted when there are no blocks
// (the optional field is unset for this locale). This is the single render
// path for long descriptions, so a future format change is localized here.
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

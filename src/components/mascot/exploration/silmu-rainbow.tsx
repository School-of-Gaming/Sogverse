/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { MASCOT_SWATCHES, type SwatchSource } from "../palette";
import { Rubric } from "./controls";

/**
 * The Silmu rainbow — the "can you tell them apart" test.
 *
 * The legacy mascot's whole identity system was a hat, because its body was
 * black and there was nothing else to vary. That works on white paper and on a
 * page where the character is 300 pixels tall. It stops working here twice
 * over: the body is nearly the page's own colour, and the sizes this product
 * actually renders a mascot at are 28, 40 and 64 pixels, where a hat is a few
 * pixels of colour on top of an indistinguishable blob.
 *
 * So this is the counter-proposal laid out to be judged rather than argued
 * about: the same drawing in every colour the product already owns, each in a
 * different hat, on the real background — and then the same set again as the
 * 40-pixel bust that a participant list would actually show. The second row is
 * the one that decides it. If two of those busts are indistinguishable, the
 * colour is not carrying the identity and the hat has to go back to carrying
 * it.
 *
 * Both rows are deliberately unsorted by hue within their group: they run in
 * `MASCOT_SWATCHES` order, which is the order a gamer meets the voice-zone
 * colours in, so neighbouring pairs here are neighbouring pairs there — the
 * hardest arrangement rather than a flattering one.
 */

/**
 * Hats, cycled so that no two neighbours wear the same one.
 *
 * Every entry is a chunky silhouette item, for the same reason the avatar hat
 * list is: at 40 pixels a hairline accessory is three grey pixels and makes
 * the face harder to read rather than easier. One empty string is in the list
 * because a set where everybody is wearing something reads as uniform in
 * exactly the way this row exists to disprove.
 */
const HAT_CYCLE = [
  "swept-cap",
  "beanie",
  "beret",
  "sprout",
  "earflap-hat",
  "painter-cap",
  "student-cap",
  "",
  "party-hat",
  "sunhat",
  "santa-hat",
  "flower-crown",
];

const GROUPS: readonly { source: SwatchSource; title: string; note: string }[] = [
  {
    source: "zone",
    title: "The sixteen voice zones",
    note: "An even sweep of the wheel, already tuned to read as a glyph on this ground.",
  },
  { source: "yty", title: "The four Yty elements", note: "The iconography this product owns." },
  {
    source: "product",
    title: "The four product types",
    note: "Placed to clear the state colours, so they clear each other too.",
  },
];

function outfitFor(index: number): { hat?: string } {
  const hat = HAT_CYCLE[index % HAT_CYCLE.length];
  return hat === "" ? {} : { hat };
}

/** One swatch, drawn at whichever size and crop the row wants. */
function Bean({
  variantId,
  label,
  index,
  size,
  bust,
}: {
  variantId: string;
  label: string;
  index: number;
  size: number;
  bust?: boolean;
}): ReactElement {
  return (
    <figure className="flex flex-col items-center gap-1">
      <span
        className={
          bust === true
            ? "overflow-hidden rounded-full border border-border bg-background"
            : "flex items-end justify-center"
        }
      >
        <Mascot
          concept="silmu"
          variant={variantId}
          pose="idle"
          expression="happy"
          outfit={outfitFor(index)}
          size={size}
          {...(bust === true ? { crop: "bust" as const } : {})}
        />
      </span>
      {bust !== true && (
        <figcaption className="text-[10px] leading-tight text-muted-foreground">{label}</figcaption>
      )}
    </figure>
  );
}

export function SilmuRainbow(): ReactElement {
  const def = getConcept("silmu");
  // `musta` first, then the swatch table in its own order — the same list the
  // concept builds its variants from, read back off the concept so this page
  // cannot show a set the species does not have.
  const entries = def.variants.map((variant, index) => ({
    id: variant.id,
    label: variant.label,
    index,
    source: MASCOT_SWATCHES.find((s) => s.id === variant.id)?.source,
  }));
  const faithful = entries[0];

  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Silmu, in every colour the product already owns
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            One body, twenty-five colourways, a different hat on each. The row that matters is the
            last one: the same twenty-five as the 40-pixel bust a participant list would show.
          </p>
        </div>

        <section>
          <Rubric
            title="The faithful one"
            note="Charcoal and a contour — the only colourway that needs an edge drawn on it, because it is the only one the page can swallow."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Bean variantId={faithful.id} label={faithful.label} index={0} size={96} />
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group.source}>
            <Rubric title={group.title} note={group.note} />
            <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
              {entries
                .filter((entry) => entry.source === group.source)
                .map((entry) => (
                  <Bean
                    key={entry.id}
                    variantId={entry.id}
                    label={entry.label}
                    index={entry.index}
                    size={96}
                  />
                ))}
            </div>
          </section>
        ))}

        <section>
          <Rubric
            title="The same twenty-five at 40 pixels"
            note="No captions on purpose. This is the size a name list renders, and the test is whether you can tell two of them apart without being told which is which."
          />
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-4">
            {entries.map((entry) => (
              <Bean
                key={entry.id}
                variantId={entry.id}
                label={entry.label}
                index={entry.index}
                size={40}
                bust
              />
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

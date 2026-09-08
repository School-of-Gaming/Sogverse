/**
 * The one surface left that spells a family literally.
 *
 * Three places in Sogverse name a font family as a string rather than reaching
 * it through a class, which is exactly the spelling this adoption is closing.
 * Two of them have to: satori draws the Open Graph cards to PNG without reading
 * a stylesheet, and an email client loads none of ours. The third does not — an
 * inline `<svg>` sits in the document and its text inherits `font-family` like
 * any other element, as the same element's `fill-*` classes already prove — it
 * merely chose to, with a `fontFamily` attribute that beats the inheritance.
 * Only one of the three still has a question the eye can answer.
 *
 * **The banner's "SOG".** The product banner's no-image fallback types the three
 * letters in a system sans at weight 900 with negative tracking, on the lifted
 * grey, in act. Two things are wrong with that and only one is a face question.
 * The face question: the family is a hardcoded system stack, so the mark is set
 * in whatever the reader's OS ships, and it is drawn at a weight no face in this
 * product loads — the app face tops out at 700 — which means the browser
 * synthesises it, and a synthesised 900 is a smeared 700. Drawn today beside
 * Poppins at 700, which is the heaviest thing the app can actually draw. The
 * other thing is not a face question at all and is recorded as a by-product: an
 * angular "SOG" on a badge-coloured ground is the logo's own monogram, which the
 * brand says exists only inside the logo and is never recreated in type.
 *
 * **The mail is ruled and gone from here.** It is set in the mail face — the
 * reader's own system sans, declared by the library, spent by the mail alone —
 * and no webfont is loaded in front of it, so there is no second column to draw:
 * the face a reader gets is the face their client already has. The living
 * foundations floor shows it beside the four loaded faces.
 *
 * **The Open Graph cards have no visual question.** They already draw Poppins,
 * fetched as TTF buffers from gstatic and handed to satori as `fontFamily:
 * "Poppins"`. Nothing about the picture changes; what changes is who owns the
 * string, and that is a ledger entry rather than a drawing.
 */

import type { ReactNode } from "react";

import { Case, Columns, Column, Exemplar, Question } from "./parts";

/** The system stack the banner's SVG names in a `font-family` attribute today. */
const SYSTEM_SANS =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * The banner's fallback, reproduced from the app's SVG.
 *
 * The `viewBox`, the percentages and the sizes are the component's own, so the
 * mark is drawn at the proportions a card actually shows; only the family and
 * the weight change between the two columns.
 */
function SogFallback({ family, weight }: { family: string; weight: number }) {
  return (
    <svg
      role="img"
      aria-label="SOG"
      viewBox="0 0 150 100"
      preserveAspectRatio="xMidYMid meet"
      className="aspect-[3/2] w-full"
    >
      <rect width="100%" height="100%" className="fill-lifted" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="36"
        fontWeight={weight}
        letterSpacing="-2"
        fontFamily={family}
        className="fill-act"
      >
        SOG
      </text>
    </svg>
  );
}

function Pair({ render }: { render: (variant: "today" | "proposed") => ReactNode }) {
  return (
    <Columns of={2}>
      <Column name="today">{render("today")}</Column>
      <Column name="Poppins">{render("proposed")}</Column>
    </Columns>
  );
}

export function UnreachableSection() {
  return (
    <Question n={4} title="Where a family is spelled by hand">
      <Case title="The product banner's fallback">
        <Exemplar
          file="src/components/ui/product-banner.tsx"
          page="Storefront, and any admin row with no product image"
        >
          <Pair
            render={(variant) =>
              variant === "today" ? (
                <SogFallback family={SYSTEM_SANS} weight={900} />
              ) : (
                <SogFallback family="var(--font-poppins)" weight={700} />
              )
            }
          />
        </Exemplar>
      </Case>
    </Question>
  );
}

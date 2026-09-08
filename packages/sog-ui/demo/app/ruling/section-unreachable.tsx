/**
 * The two surfaces a stylesheet cannot reach.
 *
 * Three renderers in Sogverse draw type without a browser reading CSS: satori
 * for the Open Graph cards, an email client for the mail, and an `<svg>` element
 * whose `font-family` is an attribute rather than a class. Each has to name a
 * family literally, which is exactly the spelling this adoption is closing — so
 * each needs an answer, and two of the three have a visual question.
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
 * **The mail's body stack.** Every mail sets `font-family:Arial,Helvetica,
 * sans-serif` on `<body>`, and there is no webfont in it: a mail client
 * downloads nothing, so the face a reader gets is a face they already have. That
 * makes the mail the one surface where naming the app face is a *preference*
 * rather than an instruction — the stack asks for Poppins first, a reader who
 * has it (anyone with the desktop app installed, and a meaningful share of
 * Apple Mail) sees the brand's face, and everyone else lands on Arial exactly as
 * they do today. So the proposed column is what the mail looks like when the
 * preference is honoured, and the today column is both what ships and what the
 * fallback still produces. Drawn on the mail's own ground, which is the app's
 * `background` — the mail's dark theme reads its neutrals from the same source
 * the theme does.
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

/** The mail-safe stack as it ships, and as the proposal would emit it. */
const MAIL_TODAY = "Arial, Helvetica, sans-serif";
const MAIL_PROPOSED = "var(--font-poppins), Arial, Helvetica, sans-serif";

const MAIL_BODY = [
  "Hi Aino,",
  "Väinämöinen's club starts on Monday 14 September at 17:00. There is nothing to prepare — a Gedu will be in the room from five minutes before, and the link below opens straight into it.",
  "If the time no longer suits you, you can move to another group from the club page at any point before the first session.",
];

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

/** The mail's message panel, on the mail's own ground. */
function MailBody({ family }: { family: string }) {
  return (
    <div className="rounded-lg bg-background p-6" style={{ fontFamily: family }}>
      <p className="mb-4 text-2xl font-bold">
        <span className="text-act">School of Gaming</span> – Sogverse
      </p>
      <div className="rounded-lg bg-card p-5">
        {MAIL_BODY.map((line) => (
          <p key={line} className="mb-4 text-base leading-7 last:mb-0">
            {line}
          </p>
        ))}
      </div>
    </div>
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
    <Question n={4} title="Where CSS does not reach">
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

      <Case title="The mail body">
        <Exemplar
          file="src/lib/email-templates/layout.ts"
          page="Every mail the platform sends"
        >
          <Pair
            render={(variant) => (
              <MailBody
                family={variant === "today" ? MAIL_TODAY : MAIL_PROPOSED}
              />
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}

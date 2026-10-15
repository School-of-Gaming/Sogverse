// The mail's type scale and its spacing, in one table each.
//
// The same shape `@/lib/constants/colors` takes for the palette: nothing here
// is spelled. Every value is read from where it is decided — the authored
// markdown definition in `@/lib/authored-markdown`, which a mail does not
// restyle and is fitted around, and SOG-UI's own type scale for the roles
// markdown has no element for. A number typed into this file would be the mail
// deciding a size for itself, which is the one thing it may not do.

import { MAIL_FACE, TYPE_SCALE, type TypeStepId } from "@sog/ui";
import { MARKDOWN_CONTAINER, MARKDOWN_LOOK } from "@/lib/authored-markdown";

const [REGULAR, BOLD] = MAIL_FACE.weights;

/** The two weights the mail face draws, and the only two a mail asks for. */
export const MAIL_WEIGHT = { regular: REGULAR, bold: BOLD } as const;

export type MailWeight = (typeof MAIL_WEIGHT)[keyof typeof MAIL_WEIGHT];

/**
 * The weight a mail asks for. The mail face draws 400 and 700 only, so a
 * weight between them lands where a browser's own font matching would put it:
 * above 500 on the heavier face, 500 and below on the lighter.
 */
export function mailWeight(weight: number): MailWeight {
  return weight > 500 ? BOLD : REGULAR;
}

/** One SOG-UI type step, by id. */
function sogStep(id: TypeStepId) {
  const step = TYPE_SCALE.find((candidate) => candidate.id === id);
  if (step === undefined) throw new Error(`SOG-UI ships no type step "${id}"`);
  return step;
}

const BODY_S = sogStep("body-s");
const CTA = sogStep("cta");

/** One level of the mail's type: size in pixels, unitless leading, a drawn weight. */
export interface MailTextStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontWeight: MailWeight;
}

/**
 * **Every text style a mail sets, and there are no others.**
 *
 * The mail is built around authored markdown rather than beside it: a report
 * is the largest block of writing most mails carry, and copy around it at a
 * scale of its own reads as two documents stapled together. So the mail's
 * body *is* the markdown body, its title *is* the markdown top heading, and
 * where markdown has no element for a role — the small furniture, a button's
 * label — the level is SOG-UI's own step for that role.
 *
 * - `title` — the markdown top heading (SOG-UI's `section` step): a mail's opening
 *   heading, and a mail section heading. A report's own top heading is the
 *   same size; the two are told apart by structure, never by capping the
 *   report — see the email-templates `CLAUDE.md`.
 * - `subtitle` — the markdown second level, for a second-rank title inside a
 *   mail section.
 * - `body` — the markdown container: paragraphs, list items, fact values,
 *   callout paragraphs, a quoted message, and the shell's content wrapper.
 * - `leadIn` — body, at markdown's strong weight: the bold line above a list
 *   or a block that says what it is.
 * - `action` — a button label, at SOG-UI's `cta` size and weight. It keeps the
 *   body's leading rather than the step's 1, because a half-width label wraps
 *   by design and a wrapped label at a leading of 1 has its lines touching.
 * - `small` — SOG-UI's `body-s`: fact labels, the callout label, the footer,
 *   staff-facing notes. Always in the muted ink, except the callout label,
 *   which takes the status colour.
 *
 * Weights are the two the mail face draws, so a 600 anywhere upstream arrives
 * here as 700 through `mailWeight`.
 */
export const MAIL_TYPE = {
  title: {
    fontSize: MARKDOWN_LOOK.h1.fontSize,
    lineHeight: MARKDOWN_LOOK.h1.lineHeight,
    fontWeight: mailWeight(MARKDOWN_LOOK.h1.fontWeight),
  },
  subtitle: {
    fontSize: MARKDOWN_LOOK.h2.fontSize,
    lineHeight: MARKDOWN_LOOK.h2.lineHeight,
    fontWeight: mailWeight(MARKDOWN_LOOK.h2.fontWeight),
  },
  body: {
    fontSize: MARKDOWN_CONTAINER.fontSize,
    lineHeight: MARKDOWN_CONTAINER.lineHeight,
    fontWeight: REGULAR,
  },
  leadIn: {
    fontSize: MARKDOWN_CONTAINER.fontSize,
    lineHeight: MARKDOWN_CONTAINER.lineHeight,
    fontWeight: mailWeight(MARKDOWN_LOOK.strong.fontWeight),
  },
  action: {
    fontSize: CTA.px,
    lineHeight: MARKDOWN_CONTAINER.lineHeight,
    fontWeight: mailWeight(CTA.weight),
  },
  small: {
    fontSize: BODY_S.px,
    lineHeight: BODY_S.lineHeight,
    fontWeight: mailWeight(BODY_S.weight),
  },
} as const satisfies Record<string, MailTextStyle>;

export type MailTypeLevel = keyof typeof MAIL_TYPE;

/**
 * A level as inline declarations, in the ink it is set in: colour, size,
 * leading, weight, in that order. Every element a helper sets text on states
 * all four rather than inheriting them, because Outlook's Word engine gives a
 * `<p>`, a heading or a cell its own default size instead of its parent's.
 *
 * `weight` overrides the level's own for the one place a level is set bold
 * without becoming another level: the callout's label, which is small type in
 * the Alert label's bold.
 */
export function mailText(
  level: MailTypeLevel,
  color: string,
  weight: MailWeight = MAIL_TYPE[level].fontWeight,
): string {
  const { fontSize, lineHeight } = MAIL_TYPE[level];
  return `color:${color};font-size:${fontSize}px;line-height:${lineHeight};font-weight:${weight};`;
}

/**
 * **The mail's vertical rhythm: markdown's spacing, as one rule.** Pixels.
 *
 * - `item` — between the items of a list (markdown's item gap).
 * - `tight` — between a lead-in and what it introduces; the gap between
 *   photo rows; the padding above and below a fact row. Markdown has no
 *   lead-in, so this step is the mail's own: half a block.
 * - `block` — between blocks inside one unit: paragraphs, a list, a button, a
 *   heading and its body, a picture and its title (markdown's paragraph gap).
 * - `furniture` — around structural furniture — a fact list, a callout, a
 *   photo grid — and on both sides of a hairline rule (markdown's second
 *   heading level's top margin).
 *
 * Markdown's largest step, the 32 above a top heading, has no entry: a mail
 * section heading always opens with a hairline rule, and the rule's own
 * furniture step stands in for it rather than stacking under it.
 */
export const MAIL_SPACE = {
  item: MARKDOWN_LOOK.ul.itemGap,
  tight: MARKDOWN_LOOK.p.marginTop / 2,
  block: MARKDOWN_LOOK.p.marginTop,
  furniture: MARKDOWN_LOOK.h2.marginTop,
} as const;

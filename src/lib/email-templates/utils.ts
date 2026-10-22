import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";
import { MAIL_SPACE, mailText } from "./type-scale";

/** Escape HTML special characters to prevent XSS in email content. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The body's text style, for any block that carries body copy — a paragraph,
 * a list, a fact's value, a callout's sentences. One string, so they agree; and
 * it is the authored-markdown body, so the mail's own copy and a report inside
 * it are set alike.
 */
export const BODY_TEXT_STYLE = mailText("body", DARK_THEME.foreground);

/**
 * The two classes that hold a plain neutral colour through the Gmail iOS app.
 *
 * **Gmail iOS rewrites every plain colour and leaves every gradient and image
 * alone.** A `color`, a `border-color` and a `background-color` all come back
 * with their lightness roughly inverted — near-white text turns dark, the
 * `#333` hairline turns near-white — while the flat gradients every fill here is
 * pinned with arrive untouched. So the ground stays dark and the ink on it goes
 * dark too. The pair is what undoes that: an outer element screened over what
 * is behind it, an inner one differenced against the outer, both on black. In
 * every other client black is the identity for both blends and the pair does
 * nothing; Gmail iOS rewrites those two blacks to white like any other plain
 * colour, which turns the inner blend into an inversion of everything inside
 * it, and the outer screen lays the result back over the untouched ground. The
 * plain greys come back as authored.
 *
 * **Everything inside a hold is inverted on Gmail iOS, so only what that client
 * inverted may go in.** That is plain neutral colour: body and muted ink, the
 * border grey. A gradient fill, a brand or status colour — pinned or not — and
 * a picture are left alone by Gmail iOS, so a hold turns them into their
 * negatives: amber comes out blue, violet green, a photograph a negative. A
 * dark plain colour inside a hold also comes out a few shades lighter in every
 * Gmail, from the screen, which is why no fill goes inside one even where its
 * colour is neutral. And a hold never goes inside another hold: the inner
 * hold's screen lands on the outer's white, screen over white is white, and
 * the text inside both vanishes.
 *
 * The rules that apply the blends are the shell's (`layout.ts`), behind the
 * Gmail-only selector, so a client that drops the stylesheet sees two bare
 * elements and nothing else.
 */
export const HOLD_CLASS = {
  /** The outer element, screened over the ground. */
  screen: "bs",
  /** The inner element, differenced against the outer. */
  difference: "bd",
} as const;

/**
 * The colour both halves of a hold paint, which is not a palette colour but a
 * blend operand: black is the identity for `screen` and `difference`, which is
 * what makes the pair do nothing outside Gmail iOS.
 */
// eslint-disable-next-line no-restricted-syntax -- a blend operand, not a colour anything shows: black is the identity for screen and difference, and no palette token stands for it.
export const HOLD_GROUND = "#000000";

/** A block of plain neutral markup, held. See `HOLD_CLASS`. */
export function holdBlock(html: string): string {
  return `<div class="${HOLD_CLASS.screen}"><div class="${HOLD_CLASS.difference}">${html}</div></div>`;
}

/**
 * A run of plain neutral text inside a line, held. `inline` follows the line's
 * own breaking, which is what a run in a sentence needs; `inline-block` is for
 * a label that is the whole content of its box, such as a button's.
 */
export function holdInline(
  html: string,
  display: "inline" | "inline-block" = "inline",
): string {
  const style = display === "inline" ? "" : ` style="display:${display};"`;
  return `<span class="${HOLD_CLASS.screen}"${style}><span class="${HOLD_CLASS.difference}"${style}>${html}</span></span>`;
}

/**
 * The colours a mail paints through `background-clip:text`, each with the
 * class the shell's stylesheet pins it under.
 *
 * Pinning restates a text colour as a gradient clipped to the glyphs, and every
 * Gmail leaves a gradient alone — so a pinned colour arrives exact where the
 * plain one would drift. **Only colours a dark theme leaves alone as a
 * background may be pinned**: amber, the status blue and the dark ink all are;
 * near-white is not, and pinning it turns it dark on Gmail Android. The house
 * style test holds each entry to a screenshot that showed it working.
 *
 * A pinned colour is never held: it is one Gmail iOS leaves alone, so a hold
 * would invert it.
 */
export const TEXT_PINS = {
  /** The brand amber: the lockup's first half and every inline link. */
  act: { className: "brand-act", color: BRAND.act },
  /** The dark ink on a light fill: the primary button's label, a light swatch's. */
  dark: { className: "pin-dark", color: DARK_THEME.bg },
  /** The info status colour: a callout's label. */
  info: { className: "pin-info", color: STATUS.info },
} as const;

const PIN_ATTRIBUTE = `class="${TEXT_PINS.act.className}"`;

/**
 * Where each pinned link in `html` starts and ends — the one thing a sentence
 * may carry that a hold must not contain. An anchor never nests, so each runs
 * from its opening tag to the first `</a>` after it.
 */
function pinnedLinkSpans(html: string): [start: number, end: number][] {
  const spans: [number, number][] = [];
  for (let start = html.indexOf("<a ", 0); start !== -1; start = html.indexOf("<a ", start + 1)) {
    const tagEnd = html.indexOf(">", start);
    if (!html.slice(start, tagEnd).includes(PIN_ATTRIBUTE)) continue;
    const close = html.indexOf("</a>", tagEnd);
    const end = close === -1 ? html.length : close + "</a>".length;
    spans.push([start, end]);
    start = end - 1;
  }
  return spans;
}

/** Elements that never take a closing tag. */
const VOID_TAGS = new Set(["br", "hr", "img", "wbr"]);

/** Markup that shows a glyph, as opposed to only tags and whitespace. */
function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim() !== "";
}

/** Whether every element opened in `html` is closed in it, in order. */
function balanced(html: string): boolean {
  const open: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const name = match[2].toLowerCase();
    if (VOID_TAGS.has(name) || match[3] === "/") continue;
    if (match[1] === "") open.push(name);
    else if (open.pop() !== name) return false;
  }
  return open.length === 0;
}

/**
 * Where each already-held span in `html` starts and ends — a block hold or an
 * inline one — found by counting its own tag against its closer from each
 * opener, so a held span's own elements do not end it early.
 */
function heldSpans(html: string): [start: number, end: number][] {
  const spans: [number, number][] = [];
  const openers = /<(div|span) class="([^"]*)"/g;
  for (let opener = openers.exec(html); opener !== null; opener = openers.exec(html)) {
    if (opener[2] !== HOLD_CLASS.screen) continue;
    const start = opener.index;
    const tags = /<(\/?)(div|span)\b/g;
    tags.lastIndex = start;
    let depth = 0;
    let end = html.length;
    for (let match = tags.exec(html); match !== null; match = tags.exec(html)) {
      if (match[2] !== opener[1]) continue;
      depth += match[1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = html.indexOf(">", match.index) + 1;
        break;
      }
    }
    spans.push([start, end]);
    openers.lastIndex = end;
  }
  return spans;
}

/**
 * The inline content of one element, with every run of plain text held and
 * every pinned link and already-held span left as it is — for a sentence that
 * carries a link, which a hold around the whole sentence would invert.
 *
 * It splits only at the top level of the content it is given, so a link is
 * never nested inside another element of the sentence; the directory's helpers
 * put every inline link directly in the sentence that carries it. A run that
 * opens an element it does not close is a composition this cannot hold, so it
 * throws rather than write a hold that ends inside an element.
 */
export function holdRuns(html: string): string {
  const keep = [...pinnedLinkSpans(html), ...heldSpans(html)].sort((a, b) => a[0] - b[0]);
  let out = "";
  let at = 0;
  const run = (text: string) => {
    if (!hasText(text)) return text;
    if (!balanced(text)) {
      throw new Error(`a run with unbalanced tags cannot be held: ${text.slice(0, 120)}`);
    }
    return holdInline(text);
  };
  for (const [start, end] of keep) {
    out += run(html.slice(at, start)) + html.slice(start, end);
    at = end;
  }
  return out + run(html.slice(at));
}

/** Whether composed markup has to be held run by run rather than whole. */
export function needsRunHolds(html: string): boolean {
  return pinnedLinkSpans(html).length > 0 || heldSpans(html).length > 0;
}

/**
 * One text element, held: whole where its content is plain, and run by run
 * where it carries a pinned link or an already-held span.
 */
export function holdText(element: (inner: string) => string, inner: string): string {
  return needsRunHolds(inner) ? element(holdRuns(inner)) : holdBlock(element(inner));
}

export function paragraph(text: string): string {
  return holdText(
    (inner) => `<p style="margin:0 0 ${MAIL_SPACE.block}px;${BODY_TEXT_STYLE}">${inner}</p>`,
    text,
  );
}

/**
 * The mail's title: its opening heading, and — after a `hairlineRule()` — a
 * mail section heading. It is the authored-markdown top heading's size, so a
 * report's own top heading matches it; the `<h2>` outranks the report's `<h3>`
 * in the outline, and the rule above a section heading is what tells the two
 * apart on the page.
 */
export function heading(text: string): string {
  return holdBlock(
    `<h2 style="margin:0 0 ${MAIL_SPACE.block}px;${mailText("title", DARK_THEME.foreground)}">${text}</h2>`,
  );
}

/**
 * A heading one rank under `heading()`: the title of one item in a run of
 * them, such as a spotlight at the foot of the session report. It is the
 * subtitle level, so it stays under a mail's title and over the item's body.
 */
export function subheading(text: string): string {
  return holdBlock(
    `<h3 style="margin:0 0 ${MAIL_SPACE.block}px;${mailText("subtitle", DARK_THEME.foreground)}">${text}</h3>`,
  );
}

/**
 * Bold, in the body's own text color — deliberately *not* a brand colour.
 * Gmail's dark-theme color rewriting left the world purple unreadable against
 * the card, and the background-clip workaround that saves act is a Gmail-only
 * patch. Weight is the emphasis every client renders the same way, so the
 * product name still stands out of the sentence without depending on a color
 * surviving. Brand color lives only where it does survive: the header and
 * button fills.
 */
export function styledProductName(name: string): string {
  return `<strong style="color:${DARK_THEME.foreground};">${escapeHtml(name)}</strong>`;
}

/**
 * A person's name inside a sentence, set exactly as a product's: bold, in the
 * body's own ink. Brand colour stays on the header and the button fills, never
 * on a word inside a paragraph.
 */
export function styledName(name: string): string {
  return styledProductName(name);
}

/**
 * A fill declared twice: once as a colour, once as a flat gradient of the same
 * colour.
 *
 * Every Gmail rewrites `background-color` in some reader's theme and leaves
 * `linear-gradient` alone, so the gradient is what actually survives and the
 * colour is the fallback for the clients that ignore `background-image` on a
 * table cell (Outlook's Word engine above all). On Gmail iOS the gradient is
 * also what keeps the ground dark at all, and a dark ground that stays put is
 * what `HOLD_CLASS` lays its re-inverted text back over.
 *
 * It lives here rather than beside the buttons because the rule is about any
 * background a mail depends on, and the largest of those is the shell's
 * ground.
 */
export function pinnedFill(color: string): string {
  return `background-color:${color};background-image:linear-gradient(${color},${color});`;
}

/**
 * The fills that have to follow the shell's ground, and the classes that move
 * them.
 *
 * **The shell has two grounds, and a fill that meant something against one of
 * them means something else against the other.** The mail is laid out for a
 * phone, where the content sits straight on the dark ground; above the shell's
 * breakpoint the same content sits inside the card. A fill chosen *in relation
 * to* what is behind it therefore has two correct values.
 *
 * There are exactly two intents, and naming them is what keeps this one
 * mechanism rather than ad-hoc rules:
 *
 * - **`step`** — a surface that reads as a tone *off* the ground: a photo's
 *   reserved well, a quoted message. Card on the bare ground, ground inside the
 *   card.
 * - **`match`** — a surface that means to be the same colour as what is behind
 *   it, and has to paint it because something else is painted underneath: the
 *   inside of a `framedCell` whose edge is a fill. Ground on the bare ground,
 *   card inside the card.
 *
 * A surface that merely sits on the ground declares no fill at all — the
 * outlined button is drawn on whatever it stands on, which is what lets it go
 * inside a hold.
 *
 * The inline half is the phone's, like every other inline value in this
 * directory, so a client that drops the stylesheet gets the correct phone
 * render rather than a fill waiting for a rule. The shell's one media query
 * builds the selectors from this table, and the call sites take both halves
 * from `groundFill()` — so a name lives in exactly one place and the rule and
 * the markup cannot drift apart.
 */
export const GROUND_TONES = {
  step: { className: "ground-step", base: DARK_THEME.card, wide: DARK_THEME.bg },
  match: { className: "ground-match", base: DARK_THEME.bg, wide: DARK_THEME.card },
} as const;

export type GroundTone = keyof typeof GROUND_TONES;

/**
 * The class name and the pinned inline fill for one ground-following surface.
 *
 * Both halves come back together because neither is correct alone: the fill
 * without the class is a phone value frozen into a desktop render, and the
 * class without the fill is a surface with nothing to paint in a client that
 * dropped the block.
 */
export function groundFill(tone: GroundTone): { className: string; fill: string } {
  const { className, base } = GROUND_TONES[tone];
  return { className, fill: pinnedFill(base) };
}

/**
 * The corner inside a `framedCell`: the outer `RADIUS` value less the edge's
 * one pixel, so the edge is the same width all the way round the corner.
 * Anything set flush inside the cell — a picture — takes this one too.
 */
export function framedInnerRadius(radius: string): string {
  return `${Math.max(0, parseFloat(radius) - 1)}px`;
}

interface FramedCellOptions {
  /** The edge's colour, painted as a pinned fill one pixel wide. */
  edge: string;
  /** The outer corner, a `RADIUS` value; the inside is one pixel tighter. */
  radius: string;
  /** What the inside paints over the edge's fill. */
  ground: GroundTone;
  /** Attributes for the outer table, such as its width. */
  tableAttrs: string;
  /** Style for the outer table: its margin and any width cap. */
  tableStyle: string;
  /** Attributes for the inner cell, such as a reserved height. */
  cellAttrs?: string;
  /** Style for the inner cell: its padding and anything it sets on its content. */
  cellStyle: string;
  content: string;
}

/**
 * A bordered box whose border is a fill: an outer cell painted in the edge
 * colour and padded one pixel, around an inner cell painted in the ground.
 *
 * **A `border-color` is a plain colour, and Gmail iOS inverts it** — the
 * border grey comes back near-white, the status blue drifts. A border around
 * text can go inside a hold, which puts it back; a border around a fill or a
 * picture cannot, because a hold would invert the fill. So such a box draws its
 * edge as a pinned gradient like every other fill, which no Gmail touches, and
 * whatever text it holds is held inside the inner cell on its own.
 */
export function framedCell({
  edge,
  radius,
  ground,
  tableAttrs,
  tableStyle,
  cellAttrs = "",
  cellStyle,
  content,
}: FramedCellOptions): string {
  const inside = groundFill(ground);
  const innerRadius = framedInnerRadius(radius);
  return `<table role="presentation" ${tableAttrs} cellpadding="0" cellspacing="0" style="${tableStyle}${pinnedFill(edge)}border-radius:${radius};">
      <tr>
        <td style="padding:1px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:${innerRadius};">
            <tr>
              <td class="${inside.className}"${cellAttrs ? ` ${cellAttrs}` : ""} style="${inside.fill}border-radius:${innerRadius};${cellStyle}">${content}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * A mail client will manufacture a link we did not write.
 *
 * Every major client linkifies anything *shaped* like an address in running
 * text, so a bare `someone@example.com` arrives clickable and styled in the
 * client's own blue — a link that is not ours, does not follow our link style,
 * and points somewhere we did not choose. That is a fault whatever the address
 * is: the two known cases are a family-read note pointing outside the platform,
 * and a sender's address in a staff mail that is already the Reply-To, where a
 * second way to reach the same place reads as a different one.
 *
 * So an address that is *displayed* rather than linked has to be defused, and
 * this is the only sanctioned way to do it. It lives here beside `escapeHtml`
 * because it belongs to the same seam — the point where a value becomes text in
 * a mail — and because both templates that need it would otherwise grow their
 * own.
 *
 * Anything a client might read as an address: a run with no whitespace
 * containing a dot followed by two or more letters (`evil.example/x`,
 * `https://www.evil.example`, `someone@example.com`). A word joiner (U+2060)
 * goes in after every dot that a letter follows, and between the colon and the
 * slashes of a scheme. It is zero-width, so the text reads the same; it breaks
 * both the `.tld` and the `scheme://` patterns, so neither kind of linkifier
 * matches. Prose is barely touched — `e.g.` has one letter after its dot,
 * `klo 16.30` a digit, a sentence-ending dot nothing — and a `file.txt` that
 * picks up a joiner loses nothing.
 */
const LINKIFIABLE_RUN = /\S+\.[A-Za-z]{2,}\S*/g;

export function defuseAutolinks(escaped: string): string {
  return escaped.replace(LINKIFIABLE_RUN, (run) =>
    run.replace(/\.(?=[A-Za-z])/g, ".&#8288;").replace(/:\/\//g, ":&#8288;//"),
  );
}

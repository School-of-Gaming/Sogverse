import { HOLD_CLASS, TEXT_PINS } from "@/lib/email-templates/utils";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";

/**
 * The plain colours Gmail iOS inverts that a mail spends as ink or as an
 * edge: the two inks, the border grey, and the white label on the violet
 * fill. Every one of them has to be inside a hold wherever it is inline.
 */
const PLAIN_NEUTRALS = new Set(
  [DARK_THEME.foreground, DARK_THEME.mutedFg, DARK_THEME.border, BRAND.worldForeground].map((c) =>
    c.toLowerCase(),
  ),
);

const PIN_CLASSES = Object.values(TEXT_PINS).map((pin) => pin.className);

/** An inline style's declarations, as `[property, value]` pairs. */
function declarations(style: string): [string, string][] {
  return style
    .split(";")
    .map((declaration) => declaration.split(":"))
    .filter((parts) => parts.length >= 2)
    .map(([property, ...value]) => [property.trim().toLowerCase(), value.join(":").trim()]);
}

function inlineColour(element: Element): string | null {
  const found = declarations(element.getAttribute("style") ?? "").find(([p]) => p === "color");
  return found === undefined ? null : found[1].toLowerCase();
}

/**
 * Every way a rendered mail breaks the hold's rules, as readable lines — empty
 * when it keeps all of them:
 *
 * - a hold is the two classes, outer and inner, and never sits inside another;
 * - nothing Gmail iOS leaves alone is inside one: no pinned text, no fill, no
 *   picture, no text in a colour that is not a plain neutral;
 * - every glyph inked in a plain neutral, and every border drawn in one, is
 *   inside one — or Gmail iOS draws it inverted;
 * - every glyph in a pinned colour is outside every hold.
 *
 * It parses the mail with the DOM's own parser, so a suite calling it runs
 * under jsdom and says so in its docblock.
 */
export function holdViolations(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const found: string[] = [];
  const held = (node: Node) =>
    node.parentElement?.closest(`.${HOLD_CLASS.difference}`) != null;
  const describe = (element: Element) => element.outerHTML.slice(0, 160);

  for (const outer of document.body.querySelectorAll(`.${HOLD_CLASS.screen}`)) {
    const inner = outer.firstElementChild;
    if (
      outer.children.length !== 1 ||
      inner === null ||
      !inner.classList.contains(HOLD_CLASS.difference)
    ) {
      found.push(`a hold whose inner half is missing: ${describe(outer)}`);
    }
    if (outer.parentElement?.closest(`.${HOLD_CLASS.screen}`)) {
      found.push(`a hold inside a hold, whose text vanishes on Gmail iOS: ${describe(outer)}`);
    }
    for (const element of outer.querySelectorAll("*")) {
      const style = element.getAttribute("style") ?? "";
      if (element.tagName === "IMG") found.push(`a picture inside a hold: ${describe(element)}`);
      if (/background-(?:color|image)\s*:/.test(style)) {
        found.push(`a fill inside a hold: ${describe(element)}`);
      }
      if (PIN_CLASSES.some((name) => element.classList.contains(name))) {
        found.push(`pinned text inside a hold: ${describe(element)}`);
      }
      const colour = inlineColour(element);
      if (colour !== null && !PLAIN_NEUTRALS.has(colour)) {
        found.push(`a colour Gmail iOS leaves alone, inside a hold: ${describe(element)}`);
      }
    }
  }

  // Every inline border in a plain neutral has to be held.
  for (const element of document.body.querySelectorAll("[style]")) {
    const style = element.getAttribute("style") ?? "";
    for (const [property, value] of declarations(style)) {
      if (!property.startsWith("border") || !value.startsWith("1px solid ")) continue;
      const colour = value.slice("1px solid ".length).toLowerCase();
      if (PLAIN_NEUTRALS.has(colour) && !element.closest(`.${HOLD_CLASS.difference}`)) {
        found.push(`a border in ${colour} outside any hold: ${describe(element)}`);
      }
    }
  }

  // Every glyph: its ink is the nearest inline colour or pin above it.
  const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/ /g, "").trim();
    if (text === "") continue;
    let inker: Element | null = node.parentElement;
    let pinned = false;
    let colour: string | null = null;
    while (inker !== null) {
      if (PIN_CLASSES.some((name) => inker!.classList.contains(name))) {
        pinned = true;
        break;
      }
      colour = inlineColour(inker);
      if (colour !== null) break;
      inker = inker.parentElement;
    }
    if (pinned && held(node)) found.push(`pinned text inside a hold: "${text.slice(0, 40)}"`);
    if (!pinned && colour !== null && PLAIN_NEUTRALS.has(colour) && !held(node)) {
      found.push(`"${text.slice(0, 40)}" in ${colour} outside any hold`);
    }
  }
  return found;
}

/**
 * Reading a mail's markup with its holds taken out.
 *
 * A hold (`HOLD_CLASS` in the email templates' utils) is a pair of bare
 * elements that only Gmail iOS acts on, wrapped around plain neutral markup.
 * Most assertions about a block — its margin, its spacing, the spans of the
 * header lockup — are about the markup inside, and a suite that matched the
 * wrappers too would be asserting that every block is held rather than what
 * it says. So those suites read the markup through `unhold`, and the house
 * style sweep asserts on the holds themselves.
 */
const TAG_PATTERNS = { div: /<div\b|<\/div>/g, span: /<span\b|<\/span>/g } as const;

/** The two halves' opening tags, in every form `holdBlock`/`holdInline` writes. */
const OPENERS = (["div", "span"] as const).flatMap((tag) =>
  ["", ' style="display:inline-block;"'].map((style) => ({
    tag,
    text: `<${tag} class="${HOLD_CLASS.screen}"${style}><${tag} class="${HOLD_CLASS.difference}"${style}>`,
  })),
);

function firstOpener(html: string) {
  let best: { tag: "div" | "span"; text: string; index: number } | null = null;
  for (const opener of OPENERS) {
    const index = html.indexOf(opener.text);
    if (index !== -1 && (best === null || index < best.index)) best = { ...opener, index };
  }
  return best;
}

/** `html` with every hold pair removed and what they held left in place. */
export function unhold(html: string): string {
  let out = html;
  for (let open = firstOpener(out); open !== null; open = firstOpener(out)) {
    const tag = open.tag;
    const tags = TAG_PATTERNS[tag];
    tags.lastIndex = open.index;
    let depth = 0;
    let close = -1;
    for (let match = tags.exec(out); match !== null; match = tags.exec(out)) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        close = match.index;
        break;
      }
    }
    if (close === -1) throw new Error(`an unclosed hold in ${out.slice(open.index, open.index + 120)}`);
    const pairCloser = `</${tag}></${tag}>`;
    const innerEnd = close + `</${tag}>`.length - pairCloser.length;
    if (out.slice(innerEnd, close + `</${tag}>`.length) !== pairCloser) {
      throw new Error(`a hold whose two halves do not close together`);
    }
    out =
      out.slice(0, open.index) +
      out.slice(open.index + open.text.length, innerEnd) +
      out.slice(close + `</${tag}>`.length);
  }
  return out;
}

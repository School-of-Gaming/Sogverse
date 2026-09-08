import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import i18next from "eslint-plugin-i18next";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

/**
 * `.ts`/`.tsx` in a relative import specifier, banned in Sogverse's own source.
 *
 * The root tsconfig sets `allowImportingTsExtensions` because the UI package's
 * token generator is run directly by Node, whose ESM resolver needs the real
 * extension. That option is program-wide, so it silently legalises the spelling
 * everywhere the root program reaches — and a `./foo.ts` import in a Next route
 * is a bundler-specific accident waiting to happen, not a style question.
 *
 * Held in a const because two config blocks below need it: a later block that
 * sets `no-restricted-imports` replaces the rule outright rather than merging
 * with it, so the family-surface block has to carry these patterns too.
 */
const noTsExtensionImports = [
  {
    group: ["./*.ts", "./**/*.ts", "../*.ts", "../**/*.ts",
            "./*.tsx", "./**/*.tsx", "../*.tsx", "../**/*.tsx"],
    message:
      "Import without the extension. The `.ts`/`.tsx` spelling is allowed only for the UI package's Node-run token generator, which is why allowImportingTsExtensions is set at the root.",
  },
];

/**
 * The mail face, banned everywhere except the mail.
 *
 * `MAIL_FACE` is the one face the UI package declares without loading: a stack
 * of whatever sans the reader's own device ships, for the single renderer that
 * downloads nothing and reads no CSS variable. On a screen the brand has a face
 * and the layout loads it, so a component reaching for this one is asking for
 * the app face and spelling it wrong — and spelling it as an inline family, on
 * a surface where `font-sans` was the whole answer.
 *
 * Both spellings are named: the library export, and the constants module that
 * derives it for the mail. The two files allowed to hold either are the
 * exemption block below.
 *
 * `allowTypeImports`, and it is why every block below states the rule in its
 * typescript-eslint form with the base rule off: the ban is on *spending* a
 * face, and a type-position import spends nothing — it renders no character and
 * emits no code. One module derives a role's ink class from the library's
 * grammar row through `import type * as`, which the base rule reads as reaching
 * for every export in the package including this one.
 *
 * Held in a const for the same reason `noTsExtensionImports` is — a later block
 * that sets the rule replaces it outright rather than merging with it, so every
 * block that sets it has to carry these too.
 */
const noMailFaceOutsideMail = [
  {
    name: "@sog/ui",
    importNames: ["MAIL_FACE"],
    allowTypeImports: true,
    message:
      "The mail face is never a screen face — it is the reader's own system sans, for the one renderer that loads nothing. A screen sets a face with the font-sans / font-serif / font-mono / font-cursive utilities.",
  },
  {
    name: "@/lib/constants/typography",
    importNames: ["MAIL_FONT_STACK", "MAIL_WORD_ENGINE_FONT_STACK"],
    allowTypeImports: true,
    message:
      "The mail face is never a screen face — MAIL_FONT_STACK and its Word-engine form are for src/lib/email-templates and nothing else. A screen sets a face with the font-sans / font-serif / font-mono / font-cursive utilities.",
  },
];

/**
 * `next/font`, importable by the root layout and nowhere else.
 *
 * A face is loaded once, in one file. `src/app/layout.tsx` loads exactly the
 * faces @sog/ui names — the contract test holds it to that list in both
 * directions — and puts each one's variable on `<html>`, which is where the
 * theme's `--font-*` tokens can see it. A second `next/font` call anywhere else
 * is Sogverse defining a face for itself: a family the library never named,
 * reaching a page through a variable no token points at, on a surface that has
 * no way of saying so.
 *
 * The group covers the subpaths as well as the bare specifier — `next/font/google`
 * is how every face in the tree is actually loaded, and a ban that named only
 * `next/font` would report nothing.
 *
 * Held in a const because four blocks below set the import rule, and a later
 * block replaces its options rather than merging with them.
 */
const noNextFontOutsideLayout = [
  {
    group: ["next/font", "next/font/*", "next/font/**"],
    message:
      "Faces are loaded in one place: src/app/layout.tsx, which loads exactly the faces @sog/ui names and defines each one's variable on <html>. Everywhere else a face is *set*, never loaded, with the font-sans / font-serif / font-mono / font-cursive utilities. See packages/sog-ui/src/tokens/typography.ts.",
  },
];

/**
 * A family spelled out, banned wherever a face is set.
 *
 * @sog/ui names the faces and Sogverse references them; a family typed into
 * this app is a face Sogverse decided for itself, and it cannot follow the
 * library when the brand's type changes — which is the whole boundary test. So
 * a `fontFamily` whose value is a string is banned and one whose value is an
 * *identifier* is not: the Open Graph cards pass `OG_FONT_FAMILY`, derived from
 * the app face in `src/lib/constants/typography.ts`, and that is the shape
 * every renderer without a stylesheet takes.
 *
 * Both spellings of the property are matched — an object property in a style
 * object, and a JSX attribute (an inline `<svg>` will happily take one) — and,
 * separately, a `font-family:` written into a string of CSS. The mail is where
 * that last one legitimately happens and it has its own, narrower ban in its
 * own block: a family *name* after the colon, so the interpolated stack passes.
 * That block replaces this one for those files, so the two never both fire.
 */
const spelledFamilyMessage =
  "No family names in Sogverse. @sog/ui names the faces and this app references them: set a face with the font-sans / font-serif / font-mono / font-cursive utilities, and where a renderer has no stylesheet (satori, canvas) pass the derived constant — OG_FONT_FAMILY from @/lib/constants/typography — rather than a string. See packages/sog-ui/src/tokens/typography.ts.";

const noSpelledFamily = [
  ...["Literal", "TemplateLiteral"].flatMap((value) => [
    {
      selector: String.raw`Property[key.name="fontFamily"] > ${value}`,
      message: spelledFamilyMessage,
    },
    {
      selector: String.raw`Property[key.value="fontFamily"] > ${value}`,
      message: spelledFamilyMessage,
    },
    {
      selector: String.raw`JSXAttribute[name.name="fontFamily"] > ${value}`,
      message: spelledFamilyMessage,
    },
    {
      selector: String.raw`JSXAttribute[name.name="fontFamily"] > JSXExpressionContainer > ${value}`,
      message: spelledFamilyMessage,
    },
  ]),
];

const noFontFamilyDeclaration = ["TemplateElement[value.raw", "Literal[value"].map(
  (node) => ({
    selector: String.raw`${node}=/font-family\s*:/]`,
    message: spelledFamilyMessage,
  }),
);

/**
 * A colour spelled as a hex literal, banned wherever the colour is not authored.
 *
 * Written once and spread into every block that bans it, because the selector is
 * the fiddly part and three hand-copied versions of it is three chances for one
 * of them to be subtly wrong (and a subtly wrong esquery regex reports nothing
 * and reads as a rule that is holding — see the String.raw note below).
 *
 * `String.raw`, not a plain string: a selector is a JS string literal that
 * esquery then parses, so `"\b"` reaches it as a backspace character and `"\s"`
 * collapses to a bare `s`. Both spellings compile to a regex that is
 * syntactically fine and matches nothing anyone would ever write, which is the
 * worst failure mode available — the rule reports no errors and looks like it is
 * working. It shipped that way once; a lint guard is only worth what a
 * deliberately-bad line proves it catches.
 *
 * 3, 4, 6 or 8 hex digits, which is every shape a CSS colour comes in. The
 * lookbehind is what keeps `&#8288;` — the word joiner that defuses a mail
 * client's autolinker — from reading as a four-digit colour. Comments are not
 * nodes, so explanatory hexes in prose are untouched.
 */
const noHexColourLiterals = (message) => [
  {
    selector: String.raw`Literal[value=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
    message,
  },
  {
    selector: String.raw`TemplateElement[value.raw=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
    message,
  },
];

/**
 * Tailwind's own palette, banned in Sogverse's source.
 *
 * `text-sky-400` is a colour nobody chose: it comes from the framework's default
 * theme, it means nothing in the brand's vocabulary, and it goes on rendering
 * after every token around it has been redefined — which is precisely the seam
 * the theme adoption exists to close. Every colour in this app arrives from
 * @sog/ui as a semantic token, so a palette class here is a colour the library
 * has no say over.
 *
 * `black` and `white` are in the list for the same reason and one more: the
 * library ships `bg-scrim` for the black tint that dims what is behind it, and
 * white is not one of the brand's inks — `foreground` is.
 *
 * The optional segment between the property and the hue is what catches the
 * spellings a bare `property-hue` regex reads straight past — `border-t-red-500`,
 * `border-x-white`, `border-s-…`, `ring-offset-black`. A ban that covers the
 * obvious spelling and not the sided one is worse than none: it reports nothing
 * on the line that got through and reads as a rule that is holding.
 *
 * Matched on nodes rather than on the file's text, so prose that happens to name
 * a colour ("it used to be washed amber-to-violet") is untouched: a comment is
 * not a Literal.
 */
const paletteClassMessage =
  "No raw Tailwind palette colours. Every colour here is a semantic token from @sog/ui (act, world, destructive, success, info, warning, the Yty families, the picks) on one of its three grounds; `bg-scrim` is the black tint and `foreground` is the ink.";

const noPaletteColourClasses = [
  {
    selector: String.raw`Literal[value=/\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide|placeholder|caret|accent)(-(t|r|b|l|x|y|s|e|offset))?-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-[0-9]{2,3})?\b/]`,
    message: paletteClassMessage,
  },
  {
    selector: String.raw`TemplateElement[value.raw=/\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide|placeholder|caret|accent)(-(t|r|b|l|x|y|s|e|offset))?-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-[0-9]{2,3})?\b/]`,
    message: paletteClassMessage,
  },
];

/**
 * A grey written as a hover, banned wherever a class string is typed.
 *
 * The greys are surfaces: `lifted` is the ground a static thing takes when it is
 * set back from its neighbours, `card` is the first lift off the page, and
 * `background` is the page. Hover is not a surface, it is a **layer** — the
 * theme's ink at a low alpha, laid over whatever ground the element is already
 * on — and the difference is not stylistic. A grey spelled as a hover has to
 * name the ground it lands on, so it draws a step on one surface and nothing at
 * all on the one above: `hover:bg-lifted` on a row that is already sitting on a
 * lifted panel is a hover nobody can see, which is precisely what the users
 * page's child rows used to be.
 *
 * `bg-hover` needs no ground, so one class is right on all three. Which means
 * this ban has exactly one fix and it is the same fix everywhere, and that is
 * what makes it a lint rule rather than a review note.
 *
 * The `focus:`, `focus-visible:` and `data-[state=…]:` grounds are deliberately
 * untouched: a focused or selected thing is in a *state*, which is a fact about
 * the element rather than about the pointer, and a grey is allowed to carry one.
 * Only the pointer variants are matched.
 *
 * Matched on nodes rather than on the file's text, exactly like the palette ban
 * above, so prose describing the old class is untouched.
 */
const hoverGreyMessage =
  "A grey is never a hover. `lifted`, `card` and `background` are surfaces a thing is authored on; the hover is `bg-hover`, @sog/ui's one state layer — the ink at a low alpha, laid over whatever ground the element already sits on, so a row on the page, on a card and on a lifted panel each lift one visible step from where they are. Write `hover:bg-hover` (or `group-hover:bg-hover`). See packages/sog-ui/src/tokens/surfaces.ts.";

const noGreyAsHover = [
  {
    selector: String.raw`Literal[value=/\b(group-)?hover:bg-(lifted|card|background)\b/]`,
    message: hoverGreyMessage,
  },
  {
    selector: String.raw`TemplateElement[value.raw=/\b(group-)?hover:bg-(lifted|card|background)\b/]`,
    message: hoverGreyMessage,
  },
];

/**
 * **The theme's own token names, read off the stylesheet the theme is.**
 *
 * Derived rather than typed out, for the reason the alpha-step test states about
 * its own list: a second, hand-written statement of the palette is the one that
 * goes stale in silence. @sog/ui adds a token, this file learns it on the next
 * lint run; @sog/ui retires one and every class still naming it starts failing
 * the same day. A frozen list would have gone on approving `primary` for as long
 * as somebody kept writing it — which is exactly what happened, in prose, for
 * the length of the theme merge.
 *
 * Read at config-load time. That is a file read in a config file, which is
 * unusual enough to say why: the alternative is importing the TypeScript source
 * the stylesheet is generated from, and the config is plain ESM that Node loads
 * without a compiler. The generated CSS is the artifact both ends already agree
 * on — a test regenerates and diffs it — so reading it is reading the theme.
 *
 * The `--x--y` shapes (`--text-h1--font-weight`) are companions of a token, not
 * tokens, and are filtered out: a class can never name one.
 */
const themeCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "packages", "sog-ui", "src", "tokens", "theme.css"),
  "utf8",
);

const themeNamespace = (namespace) => [
  ...new Set(
    [...themeCss.matchAll(new RegExp(String.raw`--${namespace}-([a-z0-9-]+)\s*:`, "g"))]
      .map((match) => match[1])
      .filter((name) => !name.includes("--")),
  ),
];

/** Every name a `bg-`, `text-`, `border-`… class may legitimately colour with. */
const COLOUR_TOKENS = themeNamespace("color");
/** The typography scale, which shares the `text-` prefix with the inks. */
const TEXT_SIZE_TOKENS = themeNamespace("text");

/**
 * The non-colour words each colour-bearing prefix also legitimately takes.
 *
 * Tailwind overloads these prefixes hard — `bg-cover` is a size, `text-center`
 * is an alignment, `border-dashed` is a style, `divide-y` is a width — so a ban
 * on "a token the theme does not define" has to know every other thing the
 * prefix means or it reports on half the app. **Each list covers its prefix's
 * utilities as Tailwind 4 defines them, not the subset this tree happens to
 * write today.** That distinction is the correction this list has already
 * needed once: a list drawn from the tree bans every legitimate utility nobody
 * has needed yet, so the first person to write `bg-clip-text` or
 * `text-shadow-sm` meets a lint error about a token the theme does not define
 * — which is true of the *colour* namespace and irrelevant to the utility they
 * wrote.
 *
 * **An entry heads a namespace rather than naming one class.** `clip` covers
 * `bg-clip-border` through `bg-clip-text`, `gradient` covers every
 * `bg-gradient-to-*`, `spacing` covers `border-spacing-2` and its axes: the
 * word is followed by an optional `-<rest>`, because enumerating each
 * namespace member by hand is the frozen list this comment already argues
 * against. The colour tokens read off the theme are matched exactly, so
 * nothing here loosens what the ban is actually for.
 *
 * `hover` appears under `bg` alone, and deliberately: the hover layer lives in
 * the *background-image* namespace rather than the colour one, so `bg-hover` is
 * the only spelling of it there is — `text-hover` and `border-hover` cannot be
 * written at all, and this list is where that stops being prose.
 */
const UNIVERSAL_KEYWORDS = ["transparent", "current", "inherit", "none"];
const LINE_STYLES = ["solid", "dashed", "dotted", "double", "hidden", "wavy"];
/**
 * The side segment, which belongs to the edge-drawing prefixes alone. It is
 * folded into the *token* rather than matched as a separate group, because a
 * separate optional group backtracks: `ring-offset-background` would try
 * `offset` as a side, find `background` legitimate, and then quietly re-read the
 * whole thing as one token named `offset-background` and report it. Written this
 * way there is one parse.
 */
const SIDED = {
  border: "t|r|b|l|x|y|s|e",
  divide: "x|y",
  ring: "offset",
  outline: "offset",
  decoration: "",
};

const EXTRA_KEYWORDS = {
  bg: [
    // background-attachment, -size, -position, -repeat, -origin, -clip,
    // -blend-mode and the whole background-image namespace, plus our own layer.
    "hover",
    "fixed", "local", "scroll",
    "cover", "contain", "auto", "size",
    "center", "top", "bottom", "left", "right", "position",
    "repeat", "no-repeat",
    "origin", "clip", "blend",
    "gradient", "linear", "radial", "conic",
  ],
  text: [
    ...TEXT_SIZE_TOKENS,
    "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
    "left", "center", "right", "justify", "start", "end",
    "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
    "shadow", "decoration",
  ],
  border: [...LINE_STYLES, "collapse", "separate", "box", "spacing"],
  divide: [...LINE_STYLES, "reverse", "x-reverse", "y-reverse"],
  ring: ["inset"],
  outline: [...LINE_STYLES, "hidden"],
  decoration: [...LINE_STYLES, "auto"],
  fill: [],
  stroke: [],
  placeholder: [],
  caret: [],
  accent: [],
  // The gradient stops. Their non-colour forms are a stop position
  // (`from-10%`) and an arbitrary value (`from-[…]`), and neither is reachable
  // by the token regex below — it requires a token starting with a letter, and
  // the lookbehind already refuses anything after a `[`. So there is no keyword
  // to list, and the empty list is here to say that rather than to hold
  // anything. A stop is otherwise a colour and nothing else, which is why these
  // three belong in the ban at all: `from-primary` names the retired token
  // exactly as `text-primary` does, and Tailwind drops it just as silently.
  // `bg-gradient-to-r` does not trip the `to` entry, because the lookbehind
  // refuses a `to-` that follows a hyphen.
  from: [],
  via: [],
  to: [],
};

/**
 * A class naming a colour token the theme does not define, banned everywhere a
 * class string is typed.
 *
 * **Tailwind 4 emits nothing at all for an unknown token, and says nothing about
 * it.** `text-primary` compiled to a real colour under the old theme; the merge
 * renamed that token to `act` and the class went on being written, being
 * reviewed, and rendering as though it carried no colour class at all — an
 * inherited ink that usually looks plausible. No build error, no console
 * warning, no visible fault to notice: the class is simply dropped on the floor.
 * That is the same failure shape as the border rule below and the same reason
 * both are lint rules rather than review notes.
 *
 * One selector per prefix rather than one big alternation, because the words a
 * prefix legitimately takes are the prefix's own — `bg-cover` is fine and
 * `text-cover` is not, and a shared allow-list would bless both.
 *
 * Two guards keep it off things that are not classes. The trailing lookahead
 * refuses a `:` or `(`, which is what a CSS *declaration* has after it — an
 * email template is full of `border-radius:` and `text-align:` and none of them
 * is a Tailwind class. And a token starting with a digit is a width, a thickness
 * or a gradient stop rather than a colour, so it is skipped rather than
 * enumerated.
 *
 * A token split across a template hole (`bg-pick-${n}`) is invisible to this and
 * that is accepted: the literal ends mid-token, so there is no name to check,
 * and the alternative is a rule that guesses.
 */
const unregisteredTokenMessage = (prefix) =>
  `\`${prefix}-…\` names a token the theme does not define, and Tailwind 4 emits nothing for it — no error, no warning, the class is simply dropped and the element inherits. Every colour comes from @sog/ui's theme (act, world, destructive, success, info, warning, the Yty families, the picks, and the neutrals background/card/lifted/border/foreground/muted-foreground). \`primary\` is the retired name of \`act\`. See packages/sog-ui/src/tokens/theme.css.`;

/**
 * **The two places a Tailwind class string is written, and the only two the
 * token ban reads.**
 *
 * The ban used to judge every `Literal` in the file, and a bare CSS property
 * name is indistinguishable from a class at that distance: `"text-transform"`,
 * `"border-top"` and `"text-align"` are property names in a style helper, a
 * canvas call or an email builder, and every one of them was reported as a
 * class naming a token the theme does not define. The trailing `:` guard in the
 * pattern catches the *declaration* (`text-align: center`) and nothing catches
 * the property on its own.
 *
 * So the ban is scoped to where a class list can actually live: a `className` /
 * `class` / `*ClassName` JSX attribute, and the argument list of the four
 * helpers that assemble one. Both are descendant scopes rather than child ones,
 * because a class string reaches either through an expression container, an
 * object of variants or a conditional — and a literal anywhere under `cn(…)` is
 * a class by construction.
 *
 * What that gives up is a class string held in a bare `const`, which no scope
 * can recognise without reading a property name as a class again. That is the
 * right direction for a guard: it misses one, it never invents one.
 */
const CLASS_STRING_SCOPES = [
  String.raw`JSXAttribute[name.name=/^(class|className|.*ClassName)$/]`,
  String.raw`CallExpression[callee.name=/^(cn|cva|clsx|twMerge)$/]`,
];

const noUnregisteredColourToken = Object.keys(EXTRA_KEYWORDS).flatMap((prefix) => {
  // The theme's own names, matched exactly — a colour token is a whole name and
  // heads nothing.
  const exact = [...COLOUR_TOKENS, ...UNIVERSAL_KEYWORDS].join("|");
  // The prefix's other utilities, each heading a namespace: `clip` stands for
  // `bg-clip-text`, `spacing` for `border-spacing-2`. See EXTRA_KEYWORDS.
  const keywords = EXTRA_KEYWORDS[prefix];
  const names = keywords.length
    ? String.raw`(?:${exact})|(?:${keywords.join("|")})(?:-[a-z0-9][\w-]*)?`
    : String.raw`(?:${exact})`;
  const side = SIDED[prefix] ?? "";
  // Everything after the prefix's hyphen that is legitimate: a name, a name
  // behind a side segment, a bare side segment, or anything numeric (a width, a
  // thickness, `ring-offset-2`). Sides are part of this rather than a group of
  // their own — see SIDED.
  const legitimate = side
    ? String.raw`(?:${side})-(?:${names})|(?:${side})|(?:${side})-[0-9][\w-]*|${names}|[0-9][\w-]*`
    : String.raw`${names}|[0-9][\w-]*`;
  // A token is a name, never a fragment: it must end on a letter or digit, so a
  // literal that stops mid-token at a template hole (`bg-pick-${…}`) has no
  // name to judge and is passed over rather than guessed at.
  const token = String.raw`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`;
  // The trailing `:` and `(` refuse a CSS *declaration* — an email template is
  // full of `border-radius:` and `text-align:`, and none of them is a class.
  // The `,` and `[` in the lookbehind are what keep an *arbitrary value* out of
  // this: `transition-[box-shadow,border-color]` names a CSS property inside
  // brackets, not a class, and nothing in a real class list ever follows a comma
  // or an opening bracket. It is also what keeps `bg-gradient-to-r` from
  // reading as a `to-` class: the `to` there follows a hyphen.
  const pattern = String.raw`(?<![\w\-,[])${prefix}-(?!(?:${legitimate})(?![\w-]))${token}(?![\w-:(])`;
  return CLASS_STRING_SCOPES.flatMap((scope) => [
    {
      selector: String.raw`${scope} Literal[value=/${pattern}/]`,
      message: unregisteredTokenMessage(prefix),
    },
    {
      selector: String.raw`${scope} TemplateElement[value.raw=/${pattern}/]`,
      message: unregisteredTokenMessage(prefix),
    },
  ]);
});

/**
 * **The face utilities the theme actually generates, read off the stylesheet.**
 *
 * Derived rather than typed out, for the reason the colour tokens above are:
 * @sog/ui adds a face and this file learns it on the next lint run; @sog/ui
 * retires one and every class still naming it starts failing the same day. The
 * pattern is anchored at the start of a declaration so `--text-h1--font-weight`
 * — a companion of a type step, which no class can ever name — is not read as a
 * face called `weight`.
 */
const FACE_UTILITIES = [
  ...new Set(
    [...themeCss.matchAll(/^\s*--font-([a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
  ),
];

/**
 * The weights this tree writes, and the reason they are a hand-written list
 * where the faces are not.
 *
 * A weight is not a face: `font-bold` names a cut of whatever family the
 * element is already in, and which weights a piece of UI may spend is the
 * **Heading adoption's** question, not this one's. Until Heading owns the
 * scale, Sogverse writes these four and no others — the list is what the tree
 * spends today, enumerated, so an unknown `font-*` fails and is added here
 * deliberately rather than arriving unnoticed. When Heading lands, the weights
 * stop being a call site's choice at all and this list goes with them.
 */
const WEIGHT_UTILITIES = ["normal", "medium", "semibold", "bold"];

/**
 * A `font-*` class that is neither one of the library's faces nor a weight,
 * banned wherever a class string is written.
 *
 * Two shapes, one rule. `font-[Arial]` is a family spelled into an arbitrary
 * value, which is the class-string spelling of the ban above. And a bare
 * `font-<word>` the theme does not generate is the same silent failure the
 * colour ban exists for: Tailwind 4 emits nothing for an unknown token, so
 * `font-display` went on being written and reviewed for months after the token
 * behind it was deleted, rendering as an element that inherited its parent's
 * face and looked plausible.
 *
 * Scoped to `CLASS_STRING_SCOPES`, like the colour-token ban: a `font-family`
 * or `font-size` in a mail's markup is a CSS property and not a class, and
 * nothing outside a class attribute or a class-assembling call is judged.
 *
 * That scoping is also the ban's limit, and it is the colour ban's limit too: a
 * class hoisted into a module constant and spread into a `className` later is
 * written outside every scope this looks at, so it is invisible here. What the
 * ban closes is the way a face is written in a class string *at the site that
 * takes one*, which is how it is written everywhere in this tree; a face
 * arriving by that other route is caught by review and by the contract tests'
 * hold on what the layout may load, not by this.
 */
const faceClassMessage = `\`font-…\` is neither a face the theme generates (${FACE_UTILITIES.map((name) => `font-${name}`).join(", ")}) nor a weight this app writes (${WEIGHT_UTILITIES.map((name) => `font-${name}`).join(", ")}), and Tailwind 4 emits nothing for a class it does not know — no error, no warning, the element simply inherits. A family is never spelled here: @sog/ui names the faces and this app references them. See packages/sog-ui/src/tokens/typography.ts.`;

const noUnknownFaceClass = (() => {
  // The same shape as the colour-token pattern: a lookbehind that refuses a
  // token continuing from a word, a hyphen, a comma or an arbitrary value's
  // bracket, then the prefix, then a negative lookahead listing everything
  // legitimate. `font-[…]` is matched explicitly, because an arbitrary value is
  // exactly what this ban is for rather than something it has to step around.
  const allowed = [...FACE_UTILITIES, ...WEIGHT_UTILITIES].join("|");
  const pattern = String.raw`(?<![\w\-,[])font-(?!(?:${allowed})(?![\w-]))(?:\[[^\]]*\]|[a-z][\w-]*)`;
  return CLASS_STRING_SCOPES.flatMap((scope) => [
    {
      selector: String.raw`${scope} Literal[value=/${pattern}/]`,
      message: faceClassMessage,
    },
    {
      selector: String.raw`${scope} TemplateElement[value.raw=/${pattern}/]`,
      message: faceClassMessage,
    },
  ]);
})();

/**
 * A border, divide, ring or outline with a width and no colour, banned.
 *
 * **`globals.css` used to colour every edge in the app from a universal
 * selector, and deleting it was the fix** — Tailwind 4 ships `currentColor` as
 * the default border colour precisely so an unnamed edge is visibly wrong rather
 * than quietly neutral. What that leaves behind is a hazard nobody can see while
 * writing: `rounded-lg border p-3` is a complete-looking class string that now
 * paints the element's *ink* around it, and on a muted row that is a grey close
 * enough to the real edge to pass review. The universal default is gone and this
 * is what stands in its place — not a default, a refusal.
 *
 * One entry per family, each a negative lookahead over the **whole literal**:
 * report a width-only utility only when nothing anywhere in the same string
 * colours that family.
 *
 * **Scoped to a `className` attribute written as one plain string, and the
 * scope is the whole reason the rule is usable.** A class string assembled from
 * several literals — `cn()` arguments, a `cva` base beside its variants — puts
 * the width in one and the colour in another perfectly legitimately, and
 * `CheckboxRow` is that shape on purpose: its base string carries `border` and
 * its `checked` variant decides between `border-act` and `border-border`.
 * Judging those literals one at a time reports every one of them, and nothing in
 * esquery or in a regex can tell which literals end up on one element. So the
 * rule only reads the case where one string *is* the element's whole class list,
 * which is where the bug this exists for actually shipped. Seven such splits sit
 * in the tree today and every one of them is correct; a rule that called them
 * defects would have been turned off inside a week.
 *
 * The gap that leaves — a genuinely uncoloured edge assembled across `cn()`
 * arguments — fails open, which is the right direction for a guard: it misses a
 * bug, it never invents one.
 *
 * `border-none` and `border-hidden` count as colouring, because they remove the
 * edge rather than leave it unnamed; `border-0` is a width that removes it, so
 * it is not a width this reports. `transparent` counts for the same reason.
 *
 * **The side segment is named inside each family's *colour* lookahead, and that
 * is the half that was missing.** A `(?:-(?:t|r|b|l|…))?` group in front of the
 * hyphen backtracks to empty, so `border-t` parsed as the word `t` colouring an
 * unsided border and the whole sided family — `border-t p-3`, `border-b
 * border-t`, `border-x rounded`, `border-t-2` — read as edges that had already
 * been named. Listing the sides (and a side carrying a width, `t-2`) as things
 * that are *not* a colour is what closes it, while `border-t-act` still counts.
 * `divide-x-reverse` and `divide-y-2` are the same escape one family over.
 * `ring-offset-…` and `outline-offset-…` are the third shape of it: the offset
 * is a ring of its own around the ring, so colouring the offset leaves the ring
 * itself on `currentColor` — the whole point of the ban.
 */
const CLASS_ATTRIBUTE = String.raw`JSXAttribute[name.name=/^(class|className|.*ClassName)$/] > Literal`;

const borderFamilyMessage = (family, fix) =>
  `\`${family}\` with a width and no colour paints \`currentColor\`, because there is no universal border-colour default any more — src/app/globals.css deleted it so an unnamed edge would be visibly wrong instead of quietly neutral. Name the edge: ${fix}.`;

const borderFamilies = [
  {
    family: "border",
    // `border`, `border-t`, `border-2`, `border-t-2` — width and side only.
    width: String.raw`(?<![\w-])border(?:-(?:t|r|b|l|x|y|s|e))?(?:-(?:2|4|8))?(?![\w-:])`,
    // Any `border[-side]-<word>` that is not a style keyword: a token name, or
    // `transparent`/`current`/`none`/`hidden`, all of which settle the edge.
    colour: String.raw`(?<![\w-])border(?:-(?:t|r|b|l|x|y|s|e))?-(?!(?:t|r|b|l|x|y|s|e)(?:-[0-9]+)?(?![\w-])|(?:solid|dashed|dotted|double|collapse|separate|box|spacing)(?![\w-]))[a-z][\w-]*`,
    fix: "`border-border` for the neutral edge, or the token the construct owns (`border-act`, `border-destructive`)",
  },
  {
    family: "divide",
    width: String.raw`(?<![\w-])divide-(?:x|y)(?:-(?:2|4|8|reverse))?(?![\w-:])`,
    colour: String.raw`(?<![\w-])divide-(?!(?:x|y)(?:-(?:[0-9]+|reverse))?(?![\w-])|(?:solid|dashed|dotted|double)(?![\w-]))[a-z][\w-]*`,
    fix: "`divide-border`",
  },
  {
    family: "ring",
    width: String.raw`(?<![\w-])ring(?:-(?:1|2|4|8))?(?![\w-:])`,
    colour: String.raw`(?<![\w-])ring-(?!(?:inset)(?![\w-])|offset(?:-[\w-]+)?(?![\w-])|[0-9])[a-z][\w-]*`,
    fix: "`ring-act` for the focus ring, or `ring-border`",
  },
  {
    family: "outline",
    width: String.raw`(?<![\w-])outline(?:-(?:1|2|4|8))?(?![\w-:])`,
    colour: String.raw`(?<![\w-])outline-(?!offset(?:-[\w-]+)?(?![\w-])|[0-9])[a-z][\w-]*`,
    fix: "`outline-act`, or `outline-none` where the outline is being removed",
  },
];

const noAbsentBorderColour = borderFamilies.flatMap(({ family, width, colour, fix }) => {
  const pattern = String.raw`^(?![\s\S]*${colour})[\s\S]*${width}`;
  return [
    {
      selector: String.raw`${CLASS_ATTRIBUTE}[value=/${pattern}/]`,
      message: borderFamilyMessage(family, fix),
    },
  ];
});

/**
 * A colour spelled as a CSS colour *function*, banned alongside the hex.
 *
 * The hex ban above closes one spelling and one only, and `rgba(18, 18, 18,
 * 0.6)` is the same colour in different clothes: a value nobody authored, that
 * no token can move, and that reads as legitimate because it looks like
 * arithmetic rather than paint. `color-mix()` is the modern shape of the same
 * mistake and the more tempting one — it composes a token with something else
 * and produces a value the library never proved.
 *
 * Alpha is the reason this matters here rather than being a duplicate of the
 * hex rule: the alpha ban is a rule about brand colour (`brand.ts`), and a
 * function is the only way to spell one in a style object. A neutral that needs
 * to composite has three named constructs and no fourth — `bg-scrim`, `glass`,
 * `bg-hover` — so a call site composing its own is writing a strength the
 * library declined to ship.
 *
 * Matched on nodes for the same reason as its neighbours, so prose naming a
 * function is untouched.
 */
const colourFunctionMessage =
  "No CSS colour functions in Sogverse. `rgb()`, `hsl()` and `color-mix()` spell a value the library never authored and no token can move — including a brand colour at an alpha step, which @sog/ui bans outright. Take the token from @sog/ui (a Tailwind class, or BRAND / DARK_THEME from @/lib/constants/colors), and where a layer really is needed use one of the three the library ships: `bg-scrim`, `glass`, `bg-hover`.";

const noColourFunctions = [
  {
    selector: String.raw`Literal[value=/(rgba?|hsla?|color-mix)\(/]`,
    message: colourFunctionMessage,
  },
  {
    selector: String.raw`TemplateElement[value.raw=/(rgba?|hsla?|color-mix)\(/]`,
    message: colourFunctionMessage,
  },
];

/**
 * The whole colour seam as Sogverse's own source is held to it.
 *
 * Held in one const because four blocks below need it and a later block
 * *replaces* a rule's options rather than merging with them — so a block that
 * narrows one ban has to restate the rest, and restating them by hand is how a
 * file quietly falls out of three bans while opting out of one.
 */
/**
 * The face seam as Sogverse's own source is held to it, in one const for the
 * same reason the colour one is: four blocks below need it, and a later block
 * replaces a rule's options rather than merging with them.
 *
 * The `font-family:` half is deliberately not in here. The mail is the one
 * surface that legitimately writes that declaration, it has a narrower ban of
 * its own in its own block, and a block that carried both would report the
 * derived stack twice.
 */
const sogverseFaceBans = [
  ...noSpelledFamily,
  ...noFontFamilyDeclaration,
  ...noUnknownFaceClass,
];

const sogverseColourBans = [
  ...noHexColourLiterals(
    "No colour literals in Sogverse. Every colour arrives from @sog/ui as a semantic token — a Tailwind class in a component, or BRAND / DARK_THEME from @/lib/constants/colors where there is no class to write (email, canvas, OG).",
  ),
  ...noPaletteColourClasses,
  ...noGreyAsHover,
  ...noUnregisteredColourToken,
  ...noAbsentBorderColour,
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  {
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Too many false positives on standard bracket notation in TypeScript
      "security/detect-object-injection": "off",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      // Types are earned, never asserted: parse at boundaries (contract
      // schemas), narrow with real guards, derive query rows via QueryData.
      // See CLAUDE.md § Service Layer Pattern and § "Fix pattern".
      // Suppressions are not accepted for this rule.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      // Every lint suppression (eslint-disable, @ts-expect-error, etc.) must
      // have a `--` description explaining why. Enforces the CLAUDE.md rule.
      "@eslint-community/eslint-comments/require-description": [
        "error",
        { ignore: [] },
      ],
    },
  },
  {
    // The library ships no user-visible string literal: every word a component
    // renders arrives as a prop, so Sogverse localises and SOG-UI presents.
    // `packages/*/demo/**` is deliberately NOT listed — literal English is legal
    // in the demo by configuration, never by a disable comment at the top of a file.
    files: ["src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", {
        mode: "jsx-only",
        "jsx-attributes": {
          include: [],
          exclude: [
            // ".*ClassName" covers compound class-name props (e.g. listClassName)
            // — Tailwind class strings, definitionally non-translatable like className.
            "className", ".*ClassName", "styleName", "style", "type", "key", "id",
            // "sizes" is the <img>/next-image srcset descriptor — a list of CSS
            // media conditions and lengths, as non-translatable as a class string.
            "width", "height", "sizes", "href", "src", "alt", "htmlFor",
            "data-.*", "role",
            "name", "value", "defaultValue", "defaultTheme",
            "autoComplete", "autoCapitalize",
            "variant", "size", "align", "side", "sideOffset",
            "asChild", "orientation", "dir", "method", "action",
            "target", "rel", "colSpan", "rowSpan",
          ],
        },
        words: {
          exclude: [
            "[0-9!-/:-@\\[-`{-~]+",
            "[A-Z_-]+",
            "^[\\p{P}\\p{S}\\p{Emoji}\\s]+$",
          ],
        },
      }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": ["error", {
        paths: noMailFaceOutsideMail,
        patterns: [...noTsExtensionImports, ...noNextFontOutsideLayout],
      }],
    },
  },
  {
    // The one file that loads a face, and the reason the ban above is worth
    // having. The root layout is where every `next/font` call in this app
    // lives: it loads exactly the faces @sog/ui names — no more, which
    // tests/unit/theme/face-contract.test.ts asserts in both directions — and
    // puts each one's variable on `<html>`, the only element the theme's
    // tokens can read it from.
    //
    // The extension patterns and the mail-face paths are restated because this
    // block replaces the rule the `src/**` block sets rather than merging with
    // it.
    files: ["src/app/layout.tsx"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": ["error", {
        paths: noMailFaceOutsideMail,
        patterns: noTsExtensionImports,
      }],
    },
  },
  {
    // The family-surface privacy line, made mechanical. Family components may
    // never import gedu workspace code: the staff note, the roster and the
    // completeness ladder must stay structurally unreachable from anything a
    // parent or child renders. The shared, role-agnostic feed pieces live in
    // @/components/session-feed — import those instead. Stated in prose in the
    // three barrel headers; enforced here so it fails the build, like the
    // route posture registry and the authorization spine enforce theirs.
    // The zone is the whole family *path*, not only its components: the club
    // page's feed is assembled in a lib module and fed by a service, and a gedu
    // type pulled in at either of those would reach the page just as surely as
    // one imported in a component. The shared arithmetic they legitimately need
    // lives in @/lib/session-occurrence, which is role-agnostic by construction.
    files: [
      "src/components/family/**/*.{ts,tsx}",
      "src/components/parent/**/*.{ts,tsx}",
      "src/components/gamer/**/*.{ts,tsx}",
      "src/lib/family-session-feed.ts",
      "src/services/family-product-feed/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": ["error", {
        // Restated rather than inherited, on the same terms as the patterns
        // below: a family surface is a screen like any other, and the mail face
        // is never a screen face.
        paths: noMailFaceOutsideMail,
        patterns: [
          // Restated rather than inherited: this block replaces the rule set by
          // the `src/**` block above, so dropping them here would quietly exempt
          // every family surface from the extension ban — and from the face
          // ban, which is the same shape one topic over: a face is loaded in
          // the root layout and nowhere else, a family surface included.
          ...noTsExtensionImports,
          ...noNextFontOutsideLayout,
          {
            // Both halves of the staff workspace: the gedu tree, and the
            // role-agnostic group workspace the gedu and admin shells both
            // render. The second is role-agnostic between *staff* roles only —
            // it draws the staff note, the roster and the completeness ladder —
            // so it sits on the staff side of this line exactly as the gedu
            // tree does, and moving a piece from one to the other must never be
            // a way out of the zone.
            group: ["@/components/gedu/*", "@/components/group-workspace/*"],
            message:
              "Family surfaces must not import staff workspace code — the privacy line is structural. Shared feed pieces live in @/components/session-feed.",
          },
          {
            // The service-layer half of the same line, and in practice the more
            // likely leak: the gedu session contracts export the staff document
            // shapes (a feed session carrying `gedu_note`, the site shape with
            // its staff notes, the whole group-feed document). A family module
            // reaching for one of those would compile, parse and render — the
            // privacy guarantee is that the family document has no field for
            // them, and importing the staff shapes is precisely how that
            // guarantee gets bypassed.
            //
            // `attendanceStatus` and its companions are the deliberate
            // exception, and the allow-list is what keeps the exception narrow.
            // They are a *vocabulary* rather than a document shape: the members
            // must match one CHECK constraint in the database, so a second copy
            // would be a second source of truth for one fact and could only
            // drift into being wrong. The family contracts file imports it and
            // says so at length.
            group: ["@/services/gedu-sessions", "@/services/gedu-sessions/*"],
            allowImportNames: [
              "attendanceStatus",
              "AttendanceStatus",
              "SUPPORTED_ATTENDANCE_STATUSES",
            ],
            message:
              "Family surfaces must not import gedu document shapes — only the shared attendance vocabulary (attendanceStatus / AttendanceStatus / SUPPORTED_ATTENDANCE_STATUSES) crosses this line, because it mirrors a database CHECK constraint.",
          },
          {
            // member-flair owns two different things behind one barrel: the
            // staff overlay document (`groupStaffOverlay` and its member
            // shape, keyed by participant and carrying a note and a join
            // stamp no family may see) and the creation entry vocabulary
            // (`gamerCreation` / `gamerCreationList`) that the overlay's own
            // `creations` field is typed with. The overlay is a staff
            // document shape on the same terms as the gedu ones above, and it
            // must stay off this side of the line even though the same file
            // also defines this zone's one legitimate export.
            //
            // The creation vocabulary is the narrow exception, on the same
            // terms as `attendanceStatus`: `gamerCreation` is the code-side
            // twin of one CHECK constraint (a creation's keys, caps and
            // blankness rule), so a second definition of what a creation
            // entry may contain would be a second source of truth for one
            // fact rather than a per-document choice. The family product feed
            // contracts file imports `gamerCreationList` for exactly that
            // reason and says so at length; `gamerCreation` is the
            // single-entry schema it is built from, and `GamerCreation` /
            // `GamerCreationList` are their inferred types — all four travel
            // together as one vocabulary, the same shape attendance crosses
            // in.
            //
            // **The indirect path is a known, accepted limit**: this covers
            // the direct import specifier only, and `GroupStaffOverlay` and
            // its member shape are re-exported from `@/types`, which is
            // unrestricted and has to stay so — it is where every convenience
            // alias in the app lives. The gedu entry above has exactly the
            // same hole and is accepted on the same terms. The rule is a
            // structural reminder at the obvious reach, not a proof: what
            // actually keeps a staff document off a family page is that the
            // family document has no field for it, so a component importing
            // the type through the barrel still has nothing to put in it.
            group: ["@/services/member-flair", "@/services/member-flair/*"],
            allowImportNames: [
              "gamerCreation",
              "GamerCreation",
              "gamerCreationList",
              "GamerCreationList",
            ],
            message:
              "Family surfaces must not import member-flair's staff overlay document shapes — only the shared creation-entry vocabulary (gamerCreation / GamerCreation / gamerCreationList / GamerCreationList) crosses this line, because it mirrors a database CHECK constraint.",
          },
        ],
      }],
    },
  },
  // Colour in Sogverse, made mechanical. The theme adoption moved every colour
  // the app spends into @sog/ui: the grounds, the ink, the signature pair, the
  // status set, the Yty families, the picks, the scrim. Sogverse's own
  // stylesheet declares no colour at all, so there are exactly two ways to write
  // one here that the library cannot govern — a hex typed into a style object,
  // and a Tailwind palette class typed into a class string — and both compile,
  // render, and cannot disagree with anything. This is the point of typing.
  //
  // Two companions hold the other halves of the same seam, and neither replaces
  // this one: `tests/unit/styling/no-colour-at-an-alpha-step.test.ts` bans a
  // token spent at `/n` (a shade the library never authored), and
  // `tests/unit/styling/globals-declares-no-colour.test.ts` keeps colour out of
  // the app's stylesheet.
  //
  // The exemptions are the next block, and each one is artwork: a thing that
  // carries its own palette because it is a picture, not a piece of UI.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error",
        ...sogverseColourBans,
        ...noColourFunctions,
        ...sogverseFaceBans,
      ],
    },
  },
  {
    // The one file under `src/` that spells a colour function on purpose, and
    // the reason it is a block of its own rather than an entry in the artwork
    // list: `lib/voice/glow.ts` is not artwork and is still subject to every
    // other ban. Its `rgba()` carries the speaking level as its alpha — the
    // value rises and falls with how loudly somebody is talking — so there is
    // no fixed strength a token could hold and nothing for the no-alpha rule to
    // convert. The colour it composes is white, which is the light rather than
    // a brand colour spent quietly, and the file's own doc comment says so at
    // length so a later sweep does not take it on pattern.
    files: ["src/lib/voice/glow.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...sogverseColourBans, ...sogverseFaceBans],
    },
  },
  {
    // Artwork, exempt from the two ways a picture spells its own paint — the
    // hex and the colour function — and from nothing else. The palette-class
    // ban above still applies, because a picture drawing its own colours does
    // so in its own paint, never in a Tailwind class.
    //
    // `layout/locale-picker.tsx` draws the five locale flags as inline SVG; a
    // flag's colours are the flag's, and the Klingon one's red is the joke.
    // `og/marks.tsx` carries the partner marks — Roblox's and Lynx's — traced
    // verbatim from the vendored files, and a partner's mark may not be
    // recoloured at all, which is a constraint from outside this repo rather
    // than a preference of ours. `admin/dashboard/pixel-art.tsx` is the trophy
    // sprite: it is gold because it is a trophy, and its earlier borrowing of
    // the act amber was a mistake that made a picture look like a brand
    // placement. `about/about-section.tsx` draws the Klingon easter egg as an
    // Empire console, and its `#d00` and `#0a0a0a` are the Empire's colours:
    // the day the brand's amber changes, that console must not follow. The red
    // is on three of the words as well as on the chrome — the console's title,
    // its Klingon column and its Qapla' sign-off are painted in it, because
    // they belong to the picture rather than sitting on top of it. The prose
    // around them is ordinary secondary text and takes the app's two inks,
    // which is why only the artwork is exempt here and the palette-class ban
    // still holds over the whole file.
    // `lib/images/normalize-image.ts` is not artwork but is the same
    // shape of exception: its white is the ground a transparent PNG is
    // flattened onto when it is re-encoded as JPEG, a property of the image's
    // own pixels rather than of the UI around it, and its doc comment says so.
    files: [
      "src/components/layout/locale-picker.tsx",
      "src/components/og/marks.tsx",
      "src/components/admin/dashboard/pixel-art.tsx",
      "src/components/about/about-section.tsx",
      "src/lib/images/normalize-image.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...noPaletteColourClasses,
        ...noGreyAsHover,
        // Restated for the reason every block here restates: this one replaces
        // the rule set above rather than merging with it, and artwork is exempt
        // from spelling a *colour*, never from spelling a face. A picture is
        // drawn, not typed — the words beside it are the app's, in the app's
        // face.
        ...sogverseFaceBans,
      ],
    },
  },
  // The email house style, made mechanical at the point of typing. Colours in a
  // mail come from @/lib/constants/colors, which derives them from @sog/ui, and
  // corners from the module that carries the radius scale — an email cannot use
  // a Tailwind class, so a literal is the easy path and the whole reason the
  // mail and the app drifted apart in the first place. Two radii and a footer
  // grey diverged this way and nobody could see it, because a number typed into
  // markup cannot disagree with anything.
  //
  // This catches the literal as it is written, with a pointer to the constant.
  // It does not catch a template that bypasses the helpers entirely — those
  // arrive through legitimate constants and are caught by the rendered-output
  // sweep in tests/unit/email-templates/house-style.test.ts. The two are
  // complementary, and neither replaces the other.
  {
    files: ["src/lib/email-templates/**/*.ts"],
    rules: {
      // The block above already bans a hex, a palette class and a colour
      // function everywhere under `src/`; this one restates all three because a
      // later block replaces a rule's options outright rather than merging with
      // them, so dropping them here would quietly exempt every mail from the
      // app-wide ban — and a mail is the surface most likely to reach for
      // `rgba()`, having no class to write. What it adds is
      // the radius, which is an email-only trap: a mail cannot use a Tailwind
      // class, so a number typed into markup is the easy path and is how two
      // radii and a footer grey drifted away from the app in the first place.
      "no-restricted-syntax": ["error",
        ...noHexColourLiterals(
          "No colour literals in an email. Import BRAND / DARK_THEME from @/lib/constants/colors, which derives the palette from @sog/ui.",
        ),
        ...noPaletteColourClasses,
        ...noGreyAsHover,
        ...noColourFunctions,
        {
          selector: String.raw`TemplateElement[value.raw=/border-radius\s*:\s*[0-9]/]`,
          message:
            "No radius literals in an email. Import RADIUS from @/lib/constants/radius, which mirrors the app's --radius scale.",
        },
        // A family typed into a mail, on the same terms as the radius above and
        // for the same reason: a mail has no class to write, so naming Arial in
        // the markup is the easy path, and it is how the mail's face and the
        // app's stopped being one decision. The two selectors are the two
        // spellings — a template literal (what every template here writes) and a
        // plain string.
        //
        // The pattern requires a family *name* after the colon, so the only form
        // that survives is `font-family:${…}` — an interpolation, whose template
        // chunk ends at the colon with nothing after it. That is the derived
        // stack and nothing else can reach the mail.
        ...["TemplateElement[value.raw", "Literal[value"].map((node) => ({
          selector: String.raw`${node}=/font-family\s*:\s*['"a-zA-Z-]/]`,
          message:
            "No font-family literals in an email. Import MAIL_FONT_STACK from @/lib/constants/typography, which derives the mail face from @sog/ui — and a mail never loads a webfont.",
        })),
        // The rest of the face seam, restated because this block replaces the
        // one above. The `font-family:` half of `sogverseFaceBans` is
        // deliberately left out and only the narrower ban directly above stands
        // here: a mail is the one surface that writes that declaration at all,
        // and the app-wide form would report the interpolated stack the mail is
        // required to write.
        ...noSpelledFamily,
        ...noUnknownFaceClass,
      ],
    },
  },
  {
    // The two files the mail face may be spelled in, and the reason the ban
    // above is worth having. `src/lib/constants/typography.ts` is the derivation
    // — the mail's half of the same seam `colors.ts` holds for the palette, so
    // a face moves in the package and the mail follows without an edit here.
    // `src/lib/email-templates/**` is the one renderer that spends it: an email
    // client downloads nothing and reads no CSS variable, so a stack written
    // into the shell's `style` attribute is the only way a mail has of naming a
    // face at all.
    //
    // The extension patterns are restated because this block replaces the rule
    // the `src/**` block sets rather than merging with it.
    files: [
      "src/lib/constants/typography.ts",
      "src/lib/email-templates/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [...noTsExtensionImports, ...noNextFontOutsideLayout],
      }],
    },
  },
  // The same guard, one tier down, for the UI package's own source. The package
  // states the rule in prose — "Nothing outside the foundations tier spells a
  // hex" — and prose is exactly what the email templates drifted past. A hex
  // typed into a primitive compiles, renders and cannot disagree with anything,
  // so it is caught here at the point of typing.
  //
  // Scoped to `packages/*/src/**` and not to `packages/*/demo/**`: the demo is a
  // consumer, and a consumer spelling a colour is a different (and separately
  // visible) mistake from the library doing it.
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error",
        ...noHexColourLiterals(
          "No colour literals outside the colour sources. Import the token from src/tokens/brand.ts or src/tokens/picks.ts, the only two files a colour is spelled in.",
        ),
        ...noGreyAsHover,
      ],
    },
  },
  // The two class-level bans reach the demo, because the demo is a consumer and
  // is held to every rule a Sogverse page is held to. A grey written as a hover
  // and a raw palette class are both things a *consumer* writes, and the demo is
  // the reference for how a consumer writes them — a reference showing the wrong
  // class teaches it to every page that copies it.
  //
  // The hex ban still stops short of here, on its own terms: it is the library's
  // rule about where colour is authored, and a consumer spelling one is a
  // separately visible mistake rather than a token drifting out of the source.
  {
    files: ["packages/*/demo/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...noPaletteColourClasses, ...noGreyAsHover],
    },
  },
  {
    // The exemptions, and the reason the rule above is worth having: these are
    // the files a colour is *authored* in, so they are the ones the ban cannot
    // apply to. `brand.ts` holds everything the brand says in colour — the
    // grounds, the signature pair, the families. `picks.ts` holds the sixteen
    // colours a person may choose for their own thing, which are not the
    // brand's and would be wrong sitting among its hues, and which is why the
    // list is a second file rather than a section of the first. `surfaces.ts`
    // holds the scrim's black, which is not a palette colour at all — it is the
    // absence of light, spelled where the construct that spends it is defined
    // precisely so it cannot be mistaken for a hue the brand owns.
    // `identicon.ts` is the same shape one more time: two of its four read the
    // signature pair, and the black and the white it spells are the artwork's
    // own — the two that make a five-by-five grid read as a pixel face rather
    // than a coloured square, and neither is the app's ground or its ink.
    files: [
      "packages/*/src/tokens/brand.ts",
      "packages/*/src/tokens/identicon.ts",
      "packages/*/src/tokens/picks.ts",
      "packages/*/src/tokens/surfaces.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "services/*/dist/**",
    // The demo app is a Next app of its own: its build output and the
    // next-env.d.ts Next writes for it are generated, exactly like the root
    // entries above.
    "packages/*/demo/.next/**",
    "packages/*/demo/next-env.d.ts",
  ]),
]);

export default eslintConfig;

/**
 * The two theme bans, named so a test can hold them.
 *
 * Both are regexes assembled from several parts, and one of them reads the
 * theme off disk — precisely the shape that fails silently: a selector that
 * compiles, matches nothing, and reads as a rule that is holding. The palette
 * ban shipped exactly that way once. `tests/unit/styling/` runs a violating line
 * and a conforming one through each, so the day one of these stops matching is
 * the day a test goes red rather than the day a colour quietly stops being
 * enforced.
 */
export { noAbsentBorderColour, noUnregisteredColourToken };

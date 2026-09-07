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
const sogverseColourBans = [
  ...noHexColourLiterals(
    "No colour literals in Sogverse. Every colour arrives from @sog/ui as a semantic token — a Tailwind class in a component, or BRAND / DARK_THEME from @/lib/constants/colors where there is no class to write (email, canvas, OG).",
  ),
  ...noPaletteColourClasses,
  ...noGreyAsHover,
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
      "no-restricted-imports": ["error", { patterns: noTsExtensionImports }],
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
      "no-restricted-imports": ["error", {
        patterns: [
          // Restated rather than inherited: this block replaces the rule set by
          // the `src/**` block above, so dropping them here would quietly exempt
          // every family surface from the extension ban.
          ...noTsExtensionImports,
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
      "no-restricted-syntax": ["error", ...sogverseColourBans, ...noColourFunctions],
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
      "no-restricted-syntax": ["error", ...sogverseColourBans],
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
      ],
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

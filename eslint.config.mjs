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
 * Matched on nodes rather than on the file's text, so prose that happens to name
 * a colour ("it used to be washed amber-to-violet") is untouched: a comment is
 * not a Literal.
 */
const paletteClassMessage =
  "No raw Tailwind palette colours. Every colour here is a semantic token from @sog/ui (act, world, destructive, success, info, warning, the Yty families, the picks) on one of its three grounds; `bg-scrim` is the black tint and `foreground` is the ink.";

const noPaletteColourClasses = [
  {
    selector: String.raw`Literal[value=/\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-[0-9]{2,3})?\b/]`,
    message: paletteClassMessage,
  },
  {
    selector: String.raw`TemplateElement[value.raw=/\b(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-[0-9]{2,3})?\b/]`,
    message: paletteClassMessage,
  },
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
      "no-restricted-syntax": ["error",
        ...noHexColourLiterals(
          "No colour literals in Sogverse. Every colour arrives from @sog/ui as a semantic token — a Tailwind class in a component, or BRAND / DARK_THEME / GRADIENT from @/lib/constants/colors where there is no class to write (email, canvas, OG).",
        ),
        ...noPaletteColourClasses,
      ],
    },
  },
  {
    // Artwork, exempt from the hex ban and only from it — the palette-class ban
    // above still applies, because a picture drawing its own colours does so in
    // its own paint, never in a Tailwind class.
    //
    // `layout/locale-picker.tsx` draws the five locale flags as inline SVG; a
    // flag's colours are the flag's, and the Klingon one's red is the joke.
    // `og/marks.tsx` carries the partner marks — Roblox's and Lynx's — traced
    // verbatim from the vendored files, and a partner's mark may not be
    // recoloured at all, which is a constraint from outside this repo rather
    // than a preference of ours. `admin/dashboard/pixel-art.tsx` is the trophy
    // sprite: it is gold because it is a trophy, and its earlier borrowing of
    // the act amber was a mistake that made a picture look like a brand
    // placement. `lib/images/normalize-image.ts` is not artwork but is the same
    // shape of exception: its white is the ground a transparent PNG is
    // flattened onto when it is re-encoded as JPEG, a property of the image's
    // own pixels rather than of the UI around it, and its doc comment says so.
    files: [
      "src/components/layout/locale-picker.tsx",
      "src/components/og/marks.tsx",
      "src/components/admin/dashboard/pixel-art.tsx",
      "src/lib/images/normalize-image.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...noPaletteColourClasses],
    },
  },
  {
    // The Klingon easter egg on the About page, exempt from both halves — and
    // the one exemption here that is not settled. Its `#d00` and `#0a0a0a` are
    // artwork on the same terms as the flags above: the section is drawn as a
    // Klingon console, and the console's colours are not the brand's. Its eight
    // `text-white/*` steps are a different matter and are still open — they are
    // ink, and ink is a token — so the file is exempt whole until that ruling
    // lands and this block narrows to the artwork.
    files: ["src/components/about/about-section.tsx"],
    rules: {
      "no-restricted-syntax": "off",
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
      // The block above already bans a hex and a palette class everywhere under
      // `src/`; this one restates both because a later block replaces a rule's
      // options outright rather than merging with them, so dropping them here
      // would quietly exempt every mail from the app-wide ban. What it adds is
      // the radius, which is an email-only trap: a mail cannot use a Tailwind
      // class, so a number typed into markup is the easy path and is how two
      // radii and a footer grey drifted away from the app in the first place.
      "no-restricted-syntax": ["error",
        ...noHexColourLiterals(
          "No colour literals in an email. Import BRAND / DARK_THEME / GRADIENT from @/lib/constants/colors, which derives the palette from @sog/ui.",
        ),
        ...noPaletteColourClasses,
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
      ],
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

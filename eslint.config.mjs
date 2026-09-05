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
      // String.raw, not a plain string: a selector is a JS string literal that
      // esquery then parses, so `"\b"` reaches it as a backspace character and
      // `"\s"` collapses to a bare `s`. Both spellings compile to a regex that
      // is syntactically fine and matches nothing anyone would ever write, which
      // is the worst failure mode available — the rule reports no errors and
      // reads as a rule that is holding. It shipped that way once; a lint guard
      // is only worth what a deliberately-bad line proves it catches.
      "no-restricted-syntax": ["error",
        {
          // 3, 4, 6 or 8 hex digits, which is every shape a CSS colour comes in.
          // The lookbehind is what keeps `&#8288;` — the word joiner that defuses
          // a client's autolinker — from reading as a four-digit colour. Comments
          // are not nodes, so the directory's explanatory hexes are untouched.
          selector: String.raw`Literal[value=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "No colour literals in an email. Import BRAND / DARK_THEME / GRADIENT from @/lib/constants/colors, which derives the palette from @sog/ui.",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "No colour literals in an email. Import BRAND / DARK_THEME / GRADIENT from @/lib/constants/colors, which derives the palette from @sog/ui.",
        },
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
        {
          // Same selector as the email rule above, and String.raw for the same
          // reason: a selector is a JS string literal esquery then parses, so an
          // escaped `\b` written in a plain string reaches it as a backspace.
          selector: String.raw`Literal[value=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "No colour literals outside the brand source. Import the token from src/tokens/brand.ts, which is the one place a colour is spelled.",
        },
        {
          selector: String.raw`TemplateElement[value.raw=/(?<!&)#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]`,
          message:
            "No colour literals outside the brand source. Import the token from src/tokens/brand.ts, which is the one place a colour is spelled.",
        },
      ],
    },
  },
  {
    // The one exemption, and the reason the rule above is worth having: the
    // brand source is where every hex in the package is authored, so it is the
    // single file the ban cannot apply to.
    files: ["packages/*/src/tokens/brand.ts"],
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

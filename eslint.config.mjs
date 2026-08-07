import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import i18next from "eslint-plugin-i18next";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";

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
    files: ["src/**/*.{ts,tsx}"],
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
            "width", "height", "href", "src", "alt", "htmlFor",
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
          {
            group: ["@/components/gedu/*"],
            message:
              "Family surfaces must not import gedu workspace code — the privacy line is structural. Shared feed pieces live in @/components/session-feed.",
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
        ],
      }],
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
  ]),
]);

export default eslintConfig;

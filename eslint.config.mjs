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
            "className", "styleName", "style", "type", "key", "id",
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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

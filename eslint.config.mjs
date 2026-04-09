import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  {
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
    },
  },
  {
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", {
        markupOnly: true,
        ignoreAttribute: [
          "className", "href", "key", "data-testid", "aria-label",
          "name", "type", "id", "role", "src", "alt", "htmlFor",
        ],
        ignore: [/^[A-Z_]+$/, /^\d+$/, /^\//, /^https?:\/\//],
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

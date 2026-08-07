/**
 * The supported UI locales, read out of the app's own source rather than
 * restated here.
 *
 * Country rows ingest a name alternate for **every** supported UI locale — that
 * is the one level where every locale has real payload, and it is how the
 * hand-seeded country translations survive the cutover as a mechanical rule
 * instead of curated data. So the generator needs the locale list, and a second
 * copy of it in this directory would be a second thing to remember when a
 * locale is added.
 *
 * `src/lib/constants/locales.ts` cannot be imported from a `.mjs` script (it is
 * TypeScript and it imports through the `@/` path alias), so the tuple is read
 * out of the file's text. The shape is pinned by that file's own unit tests and
 * by the compiler — `SUPPORTED_LOCALES` is deliberately a literal tuple there,
 * for reasons its comment explains — and this reader fails loudly rather than
 * guessing if it ever stops being one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fail } from "./cache.mjs";

const SOURCE = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "src",
  "lib",
  "constants",
  "locales.ts",
);

export function supportedLocales() {
  const text = readFileSync(SOURCE, "utf8");
  const match = /export const SUPPORTED_LOCALES = \[([^\]]*)\] as const;/.exec(text);
  if (!match) {
    fail(
      `Could not find the SUPPORTED_LOCALES tuple in ${SOURCE}. It is read as text ` +
        `because this is a .mjs script; if the declaration has changed shape, update ` +
        `the reader in scripts/lib/geonames/locales.mjs to match.`,
    );
  }
  const locales = [...match[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  if (locales.length === 0) fail(`SUPPORTED_LOCALES in ${SOURCE} parsed as empty`);
  return locales;
}

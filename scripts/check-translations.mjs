/**
 * CI check: verify all translation keys in en.json exist with non-empty values
 * in every other locale file. Exits with code 1 if any issues are found.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const MESSAGES_DIR = join(import.meta.dirname, "..", "messages");
const SOURCE_LOCALE = "en";

function flattenKeys(obj, prefix = "") {
  const keys = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(keys, flattenKeys(value, fullKey));
    } else {
      keys[fullKey] = value;
    }
  }
  return keys;
}

const sourceFile = join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`);
const sourceMessages = JSON.parse(readFileSync(sourceFile, "utf-8"));
const sourceKeys = flattenKeys(sourceMessages);
const sourceKeySet = new Set(Object.keys(sourceKeys));

const localeFiles = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json") && basename(f, ".json") !== SOURCE_LOCALE);

let hasErrors = false;

for (const file of localeFiles) {
  const locale = basename(file, ".json");
  const messages = JSON.parse(readFileSync(join(MESSAGES_DIR, file), "utf-8"));
  const keys = flattenKeys(messages);
  const keySet = new Set(Object.keys(keys));

  // Missing keys (in source but not in target)
  const missing = [...sourceKeySet].filter((k) => !keySet.has(k));
  if (missing.length > 0) {
    hasErrors = true;
    console.error(`\n[${locale}] Missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`  - ${k}`);
  }

  // Empty values
  const empty = Object.entries(keys)
    .filter(([, v]) => typeof v === "string" && v.trim() === "")
    .map(([k]) => k);
  if (empty.length > 0) {
    hasErrors = true;
    console.error(`\n[${locale}] Empty ${empty.length} translation(s):`);
    for (const k of empty) console.error(`  - ${k}`);
  }

  // Placeholder mismatch (e.g. English has {displayName} but target drops it or adds extras).
  // Extracts top-level ICU placeholders like {name} and {count, plural, ...} while
  // ignoring literal text nested inside plural/select branches.
  function extractPlaceholders(str) {
    const names = [];
    let depth = 0;
    let argStart = -1;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{") {
        if (depth === 0) argStart = i + 1;
        depth++;
      } else if (str[i] === "}") {
        depth--;
        if (depth === 0 && argStart !== -1) {
          // Extract the argument name (first word before comma or closing brace)
          const inner = str.slice(argStart, i);
          const name = inner.split(/[\s,]/)[0];
          if (name) names.push(name);
          argStart = -1;
        }
      }
    }
    return names.sort().join(",");
  }

  const mismatchedPlaceholders = [];
  for (const k of [...sourceKeySet].filter((k) => keySet.has(k))) {
    const sourcePh = extractPlaceholders(String(sourceKeys[k]));
    const targetPh = extractPlaceholders(String(keys[k]));
    if (sourcePh !== targetPh) {
      mismatchedPlaceholders.push({ key: k, expected: sourcePh, actual: targetPh });
    }
  }
  if (mismatchedPlaceholders.length > 0) {
    hasErrors = true;
    console.error(`\n[${locale}] Mismatched placeholders in ${mismatchedPlaceholders.length} key(s):`);
    for (const { key, expected, actual } of mismatchedPlaceholders) {
      console.error(`  - ${key}: expected {${expected}} but got {${actual}}`);
    }
  }

  // Extra/stale keys (in target but not in source).
  // Keys under "about.easterEgg" are intentionally locale-specific (Klingon easter egg).
  const extra = [...keySet].filter((k) => !sourceKeySet.has(k) && !k.startsWith("about.easterEgg"));
  if (extra.length > 0) {
    // Warn but don't fail — stale keys aren't blocking
    console.warn(`\n[${locale}] Extra ${extra.length} stale key(s):`);
    for (const k of extra) console.warn(`  - ${k}`);
  }
}

if (hasErrors) {
  console.error("\nTranslation check failed. See errors above.");
  process.exit(1);
} else {
  console.log("Translation check passed.");
}

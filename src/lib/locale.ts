export const DEFAULT_LOCALE = "en-US";

/**
 * Extract the highest-priority locale from an Accept-Language header.
 *
 * Examples:
 *   "fi-FI,fi;q=0.9,en;q=0.8" → "fi-FI"
 *   "en-US,en;q=0.9"           → "en-US"
 *   null / ""                   → null
 */
export function parseAcceptLanguage(header: string | null): string | null {
  if (!header) return null;

  // Split on comma, parse each entry's tag and optional quality value,
  // then return the tag with the highest quality.
  let bestTag: string | null = null;
  let bestQ = -1;

  for (const entry of header.split(",")) {
    const parts = entry.trim().split(";");
    const tag = parts[0].trim();
    if (!tag) continue;

    let q = 1;
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i].trim();
      if (param.startsWith("q=")) {
        q = parseFloat(param.slice(2));
        if (isNaN(q)) q = 0;
      }
    }

    if (q > bestQ) {
      bestQ = q;
      bestTag = tag;
    }
  }

  // Validate that Intl can handle the tag — fall back on malformed values
  if (bestTag) {
    try {
      new Intl.Locale(bestTag);
    } catch {
      return null;
    }
  }

  return bestTag;
}

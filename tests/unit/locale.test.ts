import { describe, it, expect } from "vitest";
import {
  detectLocaleFromHeader,
  matchLocaleFromHeader,
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
} from "@/lib/constants/locales";

describe("SUPPORTED_LOCALES", () => {
  // The compiler already forces the two key sets to match; this pins the one
  // thing it can't see — that they are in the same order, so LOCALE_CONFIG
  // reads as the picker does.
  it("stays in LOCALE_CONFIG's order", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(Object.keys(LOCALE_CONFIG));
  });

  // Klingon is a novelty easter egg, so it never sits among the languages a
  // user might actually need — it is always the last entry in the picker.
  // Encoded by LOCALE_CONFIG's definition order; pinned here so a future locale
  // appended at the bottom fails instead of shipping below Klingon.
  it("keeps Klingon last", () => {
    expect(SUPPORTED_LOCALES.at(-1)).toBe("tlh");
  });

  it("ships French", () => {
    expect(SUPPORTED_LOCALES).toContain("fr");
    expect(LOCALE_CONFIG.fr.nativeLabel).toBe("Français");
    expect(LOCALE_CONFIG.fr.country).toBe("FR");
  });
});

describe("detectLocaleFromHeader", () => {
  it("returns default for null header", () => {
    expect(detectLocaleFromHeader(null)).toBe("en");
  });

  it("returns default for empty string", () => {
    expect(detectLocaleFromHeader("")).toBe("en");
  });

  it("picks a supported primary language", () => {
    expect(detectLocaleFromHeader("fi-FI,en;q=0.9")).toBe("fi");
  });

  it("skips unsupported primary and picks supported secondary", () => {
    expect(detectLocaleFromHeader("de-DE,fi;q=0.9,en;q=0.8")).toBe("fi");
  });

  it("skips multiple unsupported languages to find a match", () => {
    expect(detectLocaleFromHeader("ja,zh;q=0.9,pl;q=0.8,sv;q=0.7")).toBe("sv");
  });

  it("returns default when no language is supported", () => {
    expect(detectLocaleFromHeader("de-DE,pl;q=0.9,ja;q=0.8")).toBe("en");
  });

  it("respects quality ordering over header position", () => {
    expect(detectLocaleFromHeader("fi;q=0.8,sv;q=0.9")).toBe("sv");
  });

  it("handles wildcard entries without crashing", () => {
    expect(detectLocaleFromHeader("*;q=0.5,fi;q=0.9")).toBe("fi");
  });

  it("handles single supported locale without region", () => {
    expect(detectLocaleFromHeader("sv")).toBe("sv");
  });

  it("matches French, region-qualified or not", () => {
    expect(detectLocaleFromHeader("fr-FR,en;q=0.9")).toBe("fr");
    expect(detectLocaleFromHeader("fr")).toBe("fr");
    expect(detectLocaleFromHeader("de,fr;q=0.9,en;q=0.8")).toBe("fr");
  });

  // -- Exact-tag-then-language matching --
  //
  // Each entry is tried as a whole tag before being truncated to its language
  // subtag. Today every supported locale is a bare language code, so the exact
  // pass never changes an answer — these lock in the ordering so that adding a
  // region-qualified locale (fr-CA next to fr, say) behaves as designed.

  it("matches a whole tag before truncating it", () => {
    // "sv" is both the whole tag and its own language subtag; the exact pass
    // answers first and the result is the same either way.
    expect(detectLocaleFromHeader("sv-SE,sv;q=0.9")).toBe("sv");
  });

  it("treats tags case-insensitively", () => {
    expect(detectLocaleFromHeader("FI-fi")).toBe("fi");
    expect(detectLocaleFromHeader("SV")).toBe("sv");
  });

  it("keeps quality order outside the exact/language passes", () => {
    // The top-ranked entry only matches by language subtag, and it still wins
    // over the exactly-matching lower-q entry: the language someone actually
    // asked for outranks a region variant we happen to have. (A global
    // exact-first pass would answer "fi" here and break the case above it.)
    expect(detectLocaleFromHeader("fr-CA,fi;q=0.9")).toBe("fr");
  });
});

describe("matchLocaleFromHeader", () => {
  // The reason this function exists: `detectLocaleFromHeader` answers "en" for
  // three different situations — the browser asked for English, it asked for
  // nothing at all, and it asked only for languages we don't ship. Rendering
  // needs them folded together; measuring them must not, or a German-only
  // visitor switching to French reads as overriding a correct English guess.
  // These pin the paths where the two functions diverge.

  it("returns null for a null header", () => {
    expect(matchLocaleFromHeader(null)).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(matchLocaleFromHeader("")).toBeNull();
  });

  it("returns null when nothing in the header is a locale we ship", () => {
    expect(matchLocaleFromHeader("de-DE,de;q=0.9")).toBeNull();
    expect(matchLocaleFromHeader("de-DE,pl;q=0.9,ja;q=0.8")).toBeNull();
  });

  it("distinguishes a real English request from no match at all", () => {
    // Both of these render as English; only one of them is a browser that
    // actually asked for it.
    expect(matchLocaleFromHeader("en-GB,en;q=0.9")).toBe("en");
    expect(matchLocaleFromHeader("de-DE,de;q=0.9")).toBeNull();
  });

  it("matches exactly as detectLocaleFromHeader does wherever there is a match", () => {
    // The matching logic is shared, not duplicated — the cases above in the
    // detect suite therefore cover this one too. Spot-checked here so a future
    // reimplementation of either function has to keep them in step.
    for (const header of [
      "fi-FI,en;q=0.9",
      "ja,zh;q=0.9,pl;q=0.8,sv;q=0.7",
      "fi;q=0.8,sv;q=0.9",
      "fr-CA,fi;q=0.9",
      "FI-fi",
    ]) {
      expect(matchLocaleFromHeader(header)).toBe(detectLocaleFromHeader(header));
    }
  });
});

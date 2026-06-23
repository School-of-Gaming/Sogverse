import { describe, it, expect } from "vitest";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";

describe("localizedLocationName", () => {
  it("returns the locale override when present", () => {
    expect(
      localizedLocationName(
        { name: "Helsinki", name_i18n: { sv: "Helsingfors" } },
        "sv",
      ),
    ).toBe("Helsingfors");
  });

  it("falls back to `name` when the locale has no override", () => {
    expect(
      localizedLocationName(
        { name: "Helsinki", name_i18n: { sv: "Helsingfors" } },
        "fi",
      ),
    ).toBe("Helsinki");
    expect(
      localizedLocationName(
        { name: "Helsinki", name_i18n: { sv: "Helsingfors" } },
        "en",
      ),
    ).toBe("Helsinki");
  });

  it("falls back when name_i18n is null or empty", () => {
    expect(localizedLocationName({ name: "Tampere", name_i18n: null }, "sv")).toBe(
      "Tampere",
    );
    expect(localizedLocationName({ name: "Tampere", name_i18n: {} }, "sv")).toBe(
      "Tampere",
    );
  });

  it("ignores malformed (non-string / array) name_i18n values", () => {
    expect(
      localizedLocationName({ name: "X", name_i18n: { sv: 42 } }, "sv"),
    ).toBe("X");
    expect(
      localizedLocationName({ name: "X", name_i18n: ["Helsingfors"] }, "sv"),
    ).toBe("X");
    expect(localizedLocationName({ name: "X", name_i18n: "nope" }, "sv")).toBe(
      "X",
    );
  });
});

describe("localizedNameAlternates", () => {
  it("returns every alternate-locale string value", () => {
    expect(
      localizedNameAlternates({ name_i18n: { sv: "Helsingfors" } }),
    ).toEqual(["Helsingfors"]);
  });

  it("returns [] for null/empty/malformed", () => {
    expect(localizedNameAlternates({ name_i18n: null })).toEqual([]);
    expect(localizedNameAlternates({ name_i18n: {} })).toEqual([]);
    expect(localizedNameAlternates({ name_i18n: { sv: 1 } })).toEqual([]);
  });
});

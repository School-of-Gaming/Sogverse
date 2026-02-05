import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatDate,
  generateGamerEmail,
  extractUsernameFromGamerEmail,
  isGamerEmail,
  capitalize,
} from "@/lib/utils";

describe("cn (className merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("merges Tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  it("formats USD by default", () => {
    expect(formatCurrency(29.99)).toBe("$29.99");
  });

  it("formats with different currencies", () => {
    expect(formatCurrency(100, "EUR")).toContain("100");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles large numbers", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });
});

describe("formatDate", () => {
  it("formats date strings", () => {
    const result = formatDate("2024-01-15T10:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats Date objects", () => {
    const date = new Date("2024-06-20");
    const result = formatDate(date);
    expect(result).toContain("Jun");
    expect(result).toContain("20");
  });
});

describe("gamer email utilities", () => {
  describe("generateGamerEmail", () => {
    it("generates synthetic email from username", () => {
      expect(generateGamerEmail("testuser")).toBe(
        "testuser@gamer.sogverse.internal"
      );
    });

    it("converts username to lowercase", () => {
      expect(generateGamerEmail("TestUser")).toBe(
        "testuser@gamer.sogverse.internal"
      );
    });
  });

  describe("extractUsernameFromGamerEmail", () => {
    it("extracts username from valid gamer email", () => {
      expect(
        extractUsernameFromGamerEmail("testuser@gamer.sogverse.internal")
      ).toBe("testuser");
    });

    it("returns null for non-gamer emails", () => {
      expect(extractUsernameFromGamerEmail("test@example.com")).toBeNull();
    });

    it("returns null for invalid emails", () => {
      expect(extractUsernameFromGamerEmail("not-an-email")).toBeNull();
    });
  });

  describe("isGamerEmail", () => {
    it("returns true for gamer emails", () => {
      expect(isGamerEmail("test@gamer.sogverse.internal")).toBe(true);
    });

    it("returns false for regular emails", () => {
      expect(isGamerEmail("test@example.com")).toBe(false);
    });
  });
});

describe("capitalize", () => {
  it("capitalizes first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("lowercases rest of string", () => {
    expect(capitalize("HELLO")).toBe("Hello");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { normalizePhoneNumber } from "@/lib/whatsapp";

describe("normalizePhoneNumber", () => {
  it("should strip + prefix and spaces", () => {
    expect(normalizePhoneNumber("+358 44 0824754")).toBe("358440824754");
  });

  it("should add Finnish country code to local numbers starting with 0", () => {
    expect(normalizePhoneNumber("0442721930")).toBe("358442721930");
  });

  it("should handle local number with spaces", () => {
    expect(normalizePhoneNumber(" 050 569 9741")).toBe("358505699741");
  });

  it("should pass through international numbers without +", () => {
    expect(normalizePhoneNumber("46709116891")).toBe("46709116891");
  });

  it("should strip + from international numbers", () => {
    expect(normalizePhoneNumber("+46709116891")).toBe("46709116891");
  });

  it("should handle number with only +", () => {
    expect(normalizePhoneNumber("+358401234567")).toBe("358401234567");
  });
});

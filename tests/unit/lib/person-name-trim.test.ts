import { describe, expect, it } from "vitest";
import { trimPersonName } from "@/lib/person-name-trim";
import { registerParentBody } from "@/services/users/parent-registration.contracts";

/**
 * **A typed name is trimmed of everything the profiles CHECKs refuse at its
 * edges** — `String.prototype.trim()` leaves the zero-width space U+200B, which
 * a pasted name can carry, and the database would then refuse a name that
 * looks right.
 */
describe("trimPersonName", () => {
  it.each([
    ["ordinary spaces", "  Emma  "],
    ["a no-break space", " Emma "],
    ["a byte-order mark", "﻿Emma"],
    ["a zero-width space", "Emma​"],
    ["a mix of all of them", "​  Emma﻿​\t"],
  ])("strips %s", (_label, typed) => {
    expect(trimPersonName(typed)).toBe("Emma");
  });

  it("keeps what sits inside the name", () => {
    expect(trimPersonName(" Anna​Liisa ")).toBe("Anna​Liisa");
  });

  it("lets a contract measure the name, not the zero-width space", () => {
    const parsed = registerParentBody.shape.firstName.safeParse("E​");
    expect(parsed.success).toBe(false);
    expect(registerParentBody.shape.firstName.parse("Emma​")).toBe("Emma");
  });
});

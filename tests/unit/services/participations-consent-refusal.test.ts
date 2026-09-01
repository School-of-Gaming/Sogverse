import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api/api-error";
import {
  CONSENT_REFUSED_CODE,
  consentRefusalError,
  isConsentRefusal,
} from "@/services/participations/consent-refusal";

/**
 * **The one enrolment refusal a parent is not told the reason for.**
 *
 * Both enrolment routes disclose the database's refusals verbatim, so what
 * travels through this recogniser is the difference between a parent reading
 * "registration has not yet opened" and reading a sentence full of document
 * slugs about a requirement their screen has not caught up with. It is a string
 * match because the RPC raises this as the same `check_violation` it raises
 * every disclosed refusal with — which is exactly why the match itself is worth
 * a test rather than a comment.
 */
describe("recognising the refusal", () => {
  it("swaps the database's sentence for a coded, slug-free error", () => {
    const refusal = consentRefusalError({
      code: "23514",
      message:
        "this product requires consent to roblox-privacy-policy, roblox-programme-terms before enrolling",
    });

    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal?.status).toBe(400);
    expect(refusal?.code).toBe(CONSENT_REFUSED_CODE);
    // Nothing of the original survives — the slugs least of all.
    expect(refusal?.message).not.toContain("roblox");
    expect(refusal?.message).not.toContain("requires consent");
  });

  it("leaves every other refusal alone, so it can still be disclosed", () => {
    // Same SQLSTATE, and these are the messages the routes exist to relay.
    expect(
      consentRefusalError({
        code: "23514",
        message: "registration has not yet opened for this product",
      }),
    ).toBeNull();
    expect(
      consentRefusalError({
        code: "23514",
        message: "this product is not open to parents",
      }),
    ).toBeNull();
    expect(consentRefusalError(new Error("something else entirely"))).toBeNull();
    expect(consentRefusalError(null)).toBeNull();
    expect(consentRefusalError({})).toBeNull();
  });
});

describe("recognising it again at the other end", () => {
  it("is true for what the route produced, and false for anything else", () => {
    const refusal = consentRefusalError({
      code: "23514",
      message: "this product requires consent to roblox-privacy-policy before enrolling",
    });

    // The client's half: the panel branches on this to refetch the product and
    // fall back to its generic failure line.
    expect(isConsentRefusal(refusal)).toBe(true);
    expect(isConsentRefusal(new ApiError("Invalid request", 400))).toBe(false);
    expect(isConsentRefusal(new Error("Could not sign up"))).toBe(false);
    expect(isConsentRefusal(undefined)).toBe(false);
  });
});

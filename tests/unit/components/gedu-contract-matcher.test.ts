import { describe, it, expect } from "vitest";
import {
  findGeduContractAcceptance,
  geduContractBaseVersion,
} from "@/components/gedu/contract/documents";

/**
 * **Which acceptance row answers for the version in force.**
 *
 * Every surface that states a gedu's standing — the settings card, the contract
 * page, the admin certification card — asks this one question of a bag of rows,
 * and the answer decides two things a reader sees: whether they are signed at
 * all, and *which* version string and date get printed. The rows themselves are
 * a legal record, so none of them is ever deleted; picking the right one out of
 * them is the whole of the logic.
 *
 * Three cases carry the weight. A season that is no longer in force must not
 * answer for the one that is. Both languages of one version are the same
 * agreement, so either signature makes a gedu current — and when there are two,
 * the *earliest* is the one that is printed, which is the row the admin
 * dashboard's standing read reports and therefore the only one that keeps every
 * surface naming the same date. That last case is the one no rendered demo
 * shows, because both rows render an identical card apart from the two values
 * it exists to decide.
 */

const IN_FORCE = "2026-2027";
const LAST_SEASON = "2025-2026";

/** A stored acceptance, reduced to the two fields the matcher reads. */
const row = (contractVersion: string, acceptedAt: string) => ({
  contract_version: contractVersion,
  accepted_at: acceptedAt,
});

describe("geduContractBaseVersion", () => {
  it("takes the base out of an encoded version", () => {
    expect(geduContractBaseVersion("2026-2027/fi")).toBe("2026-2027");
    expect(geduContractBaseVersion("2026-2027/en")).toBe("2026-2027");
  });

  it("treats a version with no language as its own base", () => {
    // A label from before languages were encoded into the string.
    expect(geduContractBaseVersion("2026-2027")).toBe("2026-2027");
  });
});

describe("findGeduContractAcceptance", () => {
  it("answers with the one matching row", () => {
    const signed = row(`${IN_FORCE}/fi`, "2026-03-14T09:12:00.000Z");

    expect(findGeduContractAcceptance([signed], IN_FORCE)).toBe(signed);
  });

  it("answers null when nothing matches", () => {
    expect(
      findGeduContractAcceptance(
        [row(`${LAST_SEASON}/fi`, "2025-08-01T09:00:00.000Z")],
        IN_FORCE,
      ),
    ).toBeNull();
  });

  it("lets only the in-force season answer, with two seasons on file", () => {
    const lastSeason = row(`${LAST_SEASON}/fi`, "2025-08-01T09:00:00.000Z");
    const thisSeason = row(`${IN_FORCE}/fi`, "2026-08-01T09:00:00.000Z");
    const onFile = [thisSeason, lastSeason];

    // Not merely "the earliest signature this gedu has" — that would be last
    // season's, and it says nothing about the terms in force today.
    expect(findGeduContractAcceptance(onFile, IN_FORCE)).toBe(thisSeason);
    // And the older season still answers for itself: a new version does not
    // make the old signature untrue.
    expect(findGeduContractAcceptance(onFile, LAST_SEASON)).toBe(lastSeason);
  });

  it("answers with the earlier of two languages of the same version", () => {
    const firstSigned = row(`${IN_FORCE}/fi`, "2026-03-14T09:12:00.000Z");
    const countersigned = row(`${IN_FORCE}/en`, "2026-05-02T11:30:00.000Z");

    // Both are the same agreement, so both match — the earlier one is when
    // this gedu agreed, and it is the version string and the date the card
    // prints.
    const answer = findGeduContractAcceptance(
      [firstSigned, countersigned],
      IN_FORCE,
    );
    expect(answer?.contract_version).toBe(`${IN_FORCE}/fi`);
    expect(answer?.accepted_at).toBe("2026-03-14T09:12:00.000Z");

    // Same answer whatever order the rows arrive in: the matcher picks by the
    // timestamps rather than trusting a caller's sort.
    expect(
      findGeduContractAcceptance([countersigned, firstSigned], IN_FORCE),
    ).toBe(firstSigned);
  });
});

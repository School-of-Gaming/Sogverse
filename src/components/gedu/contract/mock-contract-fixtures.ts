import type { GeduContractAcceptance } from "@/types";
import {
  geduContractStoredVersion,
  GEDU_CONTRACT_CURRENT_VERSION,
  GEDU_CONTRACT_FALLBACK_LANGUAGE,
  getGeduContractDocument,
} from "./documents";

/**
 * Fixtures for the contract page's preview scene.
 *
 * **Two scenarios, because the page has exactly two states and they cannot
 * share a render.** Either the terms are waiting to be signed or they have
 * been, and the panel under the document is one or the other; there is no third
 * arrangement and nothing else on the page varies. The signing dialog belongs to
 * the unsigned one, where it is reachable — its sign and date steps are pure UI
 * and work against local state, while accepting is a write and stays inert.
 */
export const GEDU_CONTRACT_SCENARIOS = ["unaccepted", "accepted"] as const;

export type GeduContractScenario = (typeof GEDU_CONTRACT_SCENARIOS)[number];

export function isGeduContractScenario(s: string): s is GeduContractScenario {
  return (GEDU_CONTRACT_SCENARIOS as readonly string[]).includes(s);
}

export interface GeduContractFixture {
  /** The row on the signed scenario, `null` on the unsigned one. */
  acceptance: GeduContractAcceptance | null;
  /** The name the signature line draws — the fixture gedu's, not the viewer's. */
  signerName: string;
}

/**
 * The fixture educator. A real generated UUID held as a literal, like every
 * fixture id: nothing on this page derives an identicon from it today, but a
 * readable stand-in is the kind of value that quietly becomes wrong the first
 * time something does.
 */
const FIXTURE_GEDU_ID = "b0b84dd3-b8f9-4809-8f63-0929c7b463ed";

const FIXTURE_SIGNER_NAME = "Aino Virtanen";

/** How long ago the signed scenario's signature was given. */
const SIGNED_DAYS_AGO = 12;

/**
 * The version string on the fixture row, in the encoded `<base>/<language>`
 * shape a real acceptance stores — derived from a real document rather than
 * spelled out, so the fixture cannot drift into a string the whitelist would
 * refuse. The Finnish text is the one the fixture educator signed; the scene
 * shows it verbatim, and it is deliberately not the language the scene renders
 * the document in, so the record card is seen saying which of the two texts was
 * read rather than merely echoing the page.
 */
const FIXTURE_SIGNED_DOCUMENT = getGeduContractDocument(
  GEDU_CONTRACT_CURRENT_VERSION,
  GEDU_CONTRACT_FALLBACK_LANGUAGE,
);
const FIXTURE_SIGNED_VERSION = FIXTURE_SIGNED_DOCUMENT
  ? geduContractStoredVersion(FIXTURE_SIGNED_DOCUMENT)
  : `${GEDU_CONTRACT_CURRENT_VERSION}/${GEDU_CONTRACT_FALLBACK_LANGUAGE}`;

/**
 * The page's state for one scenario, relative to the caller's `now`.
 *
 * The acceptance moment is derived rather than hardcoded, for the reason every
 * dated fixture here is: a fixed timestamp reads as "signed twelve days ago"
 * for one week and as ancient history forever after. It is instant arithmetic
 * on an instant — no wall clock involved — so no zone or DST reasoning applies.
 */
export function buildGeduContractFixture(
  now: Date,
  scenario: GeduContractScenario,
): GeduContractFixture {
  if (scenario === "unaccepted") {
    return { acceptance: null, signerName: FIXTURE_SIGNER_NAME };
  }
  return {
    signerName: FIXTURE_SIGNER_NAME,
    acceptance: {
      gedu_id: FIXTURE_GEDU_ID,
      contract_version: FIXTURE_SIGNED_VERSION,
      accepted_at: new Date(
        now.getTime() - SIGNED_DAYS_AGO * 24 * 60 * 60 * 1000,
      ).toISOString(),
      signed_name: FIXTURE_SIGNER_NAME,
    },
  };
}

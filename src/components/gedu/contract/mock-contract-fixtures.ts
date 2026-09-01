import type { GeduCriminalRecordCheck } from "@/services/gedu/gedu-profiles.service";
import type { GeduContractAcceptance } from "@/types";
import {
  geduContractStoredVersion,
  GEDU_CONTRACT_CURRENT_VERSION,
  GEDU_CONTRACT_FALLBACK_LANGUAGE,
  getGeduContractDocument,
} from "./documents";

/**
 * Fixtures for the surfaces that render the contract over made-up data: the
 * page's preview scene, and the settings card's section of the style guide.
 * They share one educator and one acceptance shape and differ only in the
 * moment — the scene's is relative to a clock, the style guide's are fixed
 * literals — which is why the row builder below takes it rather than deciding
 * it.
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
  /**
   * The criminal record check standing the section above the terms renders.
   *
   * It rides the *same* axis as the signature rather than earning scenarios of
   * its own, because the two states of that section are the two states of this
   * page: an educator who has not signed has almost certainly not presented an
   * extract either, and one who has done both is the settled account. The third
   * possibility — the read failed and the section shows its explanation with no
   * standing line — is a rendering of an error, not a state a reader is ever
   * meant to be in, so no scenario is spent on it.
   */
  criminalRecordCheck: GeduCriminalRecordCheck;
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
 * How long ago that scenario's extract was recorded — after the signature,
 * because that is the order the two steps happen in.
 */
const CHECKED_DAYS_AGO = 9;

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
 * One acceptance row by the fixture educator, at the moment the caller names.
 *
 * The moment is the caller's because the two fixture surfaces want opposite
 * things from it: the scene's has to follow a clock (a hardcoded timestamp
 * reads as "signed twelve days ago" for one week and as ancient history
 * forever after), while the style guide's has to sit still, since what it shows
 * is the card's height and a date that drifts is a height that drifts with it.
 *
 * The version is always the current one, derived above — every fixture surface
 * renders the card as it stands today.
 */
export function buildGeduContractAcceptance({
  acceptedAt,
}: {
  acceptedAt: string;
}): GeduContractAcceptance {
  return {
    gedu_id: FIXTURE_GEDU_ID,
    contract_version: FIXTURE_SIGNED_VERSION,
    accepted_at: acceptedAt,
    signed_name: FIXTURE_SIGNER_NAME,
  };
}

/**
 * The page's state for one scenario, relative to the caller's `now`.
 *
 * The acceptance moment is derived rather than hardcoded, for the reason given
 * above. It is instant arithmetic on an instant — no wall clock involved — so
 * no zone or DST reasoning applies.
 */
export function buildGeduContractFixture(
  now: Date,
  scenario: GeduContractScenario,
): GeduContractFixture {
  if (scenario === "unaccepted") {
    return {
      acceptance: null,
      signerName: FIXTURE_SIGNER_NAME,
      criminalRecordCheck: { passed: false, recordedAt: null },
    };
  }
  return {
    signerName: FIXTURE_SIGNER_NAME,
    acceptance: buildGeduContractAcceptance({
      acceptedAt: new Date(
        now.getTime() - SIGNED_DAYS_AGO * 24 * 60 * 60 * 1000,
      ).toISOString(),
    }),
    criminalRecordCheck: {
      passed: true,
      // A few days after the signature, derived from the same clock and for the
      // same reason: a hardcoded date reads as recent for one week and as
      // ancient history forever after.
      recordedAt: new Date(
        now.getTime() - CHECKED_DAYS_AGO * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
  };
}

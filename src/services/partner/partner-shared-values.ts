import { CONSENT_DOCUMENT_BUNDLES } from "@/lib/constants/consent-documents";
import type { EffectiveProductStatus } from "@/lib/products/effective-status";
import type {
  LocationChainNode,
  LocationWithChain,
} from "@/services/locations/locations.service";
import {
  ENROLMENT_STATUS,
  type PartnerDelivery,
  type PartnerEnrolmentStatus,
  type PartnerPlace,
} from "./partner.contracts";

/**
 * The partner API's pure derivations: the values more than one resource reports
 * and so must derive the same way. No I/O here — the reads that feed these live
 * in `partner-scope.server.ts` and `partner-shared-lookups.server.ts`.
 */

// ---------------------------------------------------------------------------
// The Programme
// ---------------------------------------------------------------------------

/**
 * The Programme's two documents, read off the consent registry's own bundle
 * rather than spelled as literals: the bundle is where the app already says
 * which slug is the Programme's terms and which its privacy policy, so a
 * renamed slug moves the API with it. Resolved at module load and thrown on if
 * missing, because a partner API that silently scoped itself to no products
 * would answer every pull with an empty — and believable — dataset.
 */
function programmeDocumentSlugs(): { terms: string; privacy: string } {
  const bundle = CONSENT_DOCUMENT_BUNDLES.find(
    (candidate) => candidate.id === "roblox-programme",
  );
  const terms = bundle?.sentenceTags.terms;
  const privacy = bundle?.sentenceTags.privacy;
  if (terms === undefined || privacy === undefined) {
    throw new Error(
      "partner API: the roblox-programme consent bundle no longer names its terms and privacy documents",
    );
  }
  return { terms, privacy };
}

const PROGRAMME_SLUGS = programmeDocumentSlugs();

/**
 * The slug that makes a product a Programme product (D2): a product is in the
 * Programme exactly when it requires this document. `is_visible` plays no part.
 */
export const PROGRAMME_TERMS_SLUG = PROGRAMME_SLUGS.terms;

/** The Programme's privacy policy — the second document an enrolment reports. */
export const PROGRAMME_PRIVACY_SLUG = PROGRAMME_SLUGS.privacy;

/**
 * The Programme's age band, 13 to 17 inclusive, as its terms and the published
 * page state it. Not the product range in `src/lib/constants/gamer-age.ts`:
 * that is the span every product serves (7–17), and this is one programme's
 * legal eligibility, which does not move when the shop's bands do.
 */
export const PROGRAMME_AGE_RANGE = { min: 13, max: 17 } as const;

/**
 * The seat states that put a seat in scope (D3): everything a family holds,
 * never `reserving`. The same tuple as the contract's enrolment statuses, since
 * a live seat is exactly one the API may report.
 */
export const LIVE_SEAT_STATUSES = ENROLMENT_STATUS;

/**
 * Narrow a stored seat status to a live one. A read that filters on
 * `LIVE_SEAT_STATUSES` refuses nothing with it that the database did not
 * already refuse; it is how the row's status gets the enrolment status type.
 */
export function isLiveStatus(status: string): status is PartnerEnrolmentStatus {
  return (LIVE_SEAT_STATUSES as readonly string[]).includes(status);
}

/**
 * The status an enrolment reports (D3). A seat keeps `active` in storage after
 * its product has run its course — nothing flips it — so an active seat on a
 * completed product reports `completed`, as does a stored `completed`. A
 * waitlisted seat stays `waitlisted` whatever the product did: it never held a
 * place to complete. Filters on the reported value, never the stored one.
 */
export function reportedEnrolmentStatus(
  seatStatus: PartnerEnrolmentStatus,
  productStatus: EffectiveProductStatus,
): PartnerEnrolmentStatus {
  if (seatStatus === "active" && productStatus === "completed") {
    return "completed";
  }
  return seatStatus;
}

// ---------------------------------------------------------------------------
// Values on the wire
// ---------------------------------------------------------------------------

/**
 * Every timestamp the API emits, normalised to ISO 8601 UTC with a `Z` (D19).
 * PostgREST serialises a timestamptz with an offset (`+00:00`), which the
 * contract's timestamp schema refuses, and the published page promises UTC.
 * An unparseable value throws rather than emitting `Invalid Date`'s refusal.
 */
export function toUtcIso(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(`partner API: ${JSON.stringify(value)} is not a timestamp`);
  }
  return new Date(time).toISOString();
}

/**
 * How a product is delivered, in the API's two words: a remote product is
 * `online`, every other one `in_person`.
 */
export function productDelivery(isRemote: boolean): PartnerDelivery {
  return isRemote ? "online" : "in_person";
}

/**
 * Is this a link to Roblox (D13)? An `http` or `https` URL whose host is
 * `roblox.com` or a subdomain of it. The host is compared as the URL parser
 * reads it, so `roblox.com.evil.example`, `evilroblox.com` and a `roblox.com`
 * hidden in the path or the userinfo are all no.
 */
export function isRobloxUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return host === "roblox.com" || host.endsWith(".roblox.com");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Does a session exist for the API (D6)? Only once somebody recorded it: a
 * written report, or at least one attendance mark. A `group_sessions` row made
 * only to hold a staff note or an image is staff scaffolding, not a session a
 * partner should count. A report of nothing but whitespace is not written.
 */
export function isRecordedSession(
  report: string | null,
  attendanceMarks: number,
): boolean {
  return (report !== null && report.trim() !== "") || attendanceMarks > 0;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/**
 * A location as the API names it (D5): `place` is the nearest
 * municipality, self included, with its country; `country_code` is the
 * location's country whether or not a municipality was found — the research row
 * reports a country without a city.
 */
export interface ResolvedPlace {
  place: PartnerPlace | null;
  country_code: string | null;
}

/**
 * Resolve one location with its ancestor chain (nearest first, as the
 * locations service returns it) to the place the API reports.
 *
 * `country_code` is denormalised onto every location row, so the nearest one in
 * the chain that carries it is the location's country. A municipality with no
 * country anywhere in its chain has no place: the contract's place requires
 * both halves, and a city without a country is not one the partner can map.
 */
export function resolvePlace(location: LocationWithChain): ResolvedPlace {
  const chain: LocationChainNode[] = [location, ...location.ancestors];
  const country_code =
    chain.find((node) => node.country_code !== null)?.country_code ?? null;
  const municipalityAt = chain.findIndex((node) => node.type === "municipality");
  if (municipalityAt === -1 || country_code === null) {
    return { place: null, country_code };
  }
  const municipality = chain[municipalityAt];
  const municipalityCountry =
    chain.slice(municipalityAt).find((node) => node.country_code !== null)
      ?.country_code ?? country_code;
  return {
    place: { city: municipality.name, country_code: municipalityCountry },
    country_code,
  };
}

import type { ConsentState } from "@/lib/consent";
import {
  UTM_FIELDS,
  UTM_QUERY_PARAMS,
  utmMetadataForConsent,
  type UtmField,
  type UtmInput,
} from "@/lib/utm";
import {
  seatAnswersSessionMetadata,
  type SeatAnswersSessionMetadata,
} from "./participations.contracts";

/**
 * What a booking writes onto the seat it creates beyond who and what — the
 * visit's UTM tag and the School of Gaming mailing answer — as the parameters
 * `create_participation` and `confirm_paid_participation` both take.
 *
 * A key is present only when it holds a value, so an absent one reaches the
 * RPC's DEFAULT NULL: no consent, no tag, or a product that did not ask.
 */
export type SeatAnswerArgs = Partial<
  Record<`p_${(typeof UTM_QUERY_PARAMS)[UtmField]}`, string>
> & { p_school_of_gaming_marketing_opt_in?: boolean };

/** The session-metadata key each UTM field travels under. */
const UTM_SESSION_KEYS = {
  source: "utmSource",
  medium: "utmMedium",
  campaign: "utmCampaign",
  content: "utmContent",
  term: "utmTerm",
} as const satisfies Record<UtmField, keyof SeatAnswersSessionMetadata>;

/**
 * The seat answers for one booking request.
 *
 * The UTM half goes through `utmMetadataForConsent`, so it is empty unless
 * `consent` — parsed by the caller from THIS request's own cookie header —
 * grants marketing (`src/lib/utm.ts`, point 2). The opt-in is the parent's own
 * answer to a box on the panel and needs no cookie: it is passed through as
 * given, absent when the box was not shown.
 */
export function seatAnswerArgs(
  consent: ConsentState | null,
  utm: UtmInput | undefined,
  schoolOfGamingMarketingOptIn: boolean | undefined,
): SeatAnswerArgs {
  const metadata = utmMetadataForConsent(consent, utm);
  const args: SeatAnswerArgs = {};
  for (const field of UTM_FIELDS) {
    const key = UTM_QUERY_PARAMS[field];
    // A field that did not survive is omitted from the metadata, not nulled.
    if (Object.hasOwn(metadata, key)) args[`p_${key}`] = metadata[key];
  }
  if (schoolOfGamingMarketingOptIn !== undefined) {
    args.p_school_of_gaming_marketing_opt_in = schoolOfGamingMarketingOptIn;
  }
  return args;
}

/**
 * The same answers as Checkout Session metadata, for a paid seat the webhook
 * writes once the money lands. Only the keys that hold a value are written.
 */
export function seatAnswersToSessionMetadata(
  args: SeatAnswerArgs,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const field of UTM_FIELDS) {
    const value = args[`p_${UTM_QUERY_PARAMS[field]}`];
    if (value !== undefined) metadata[UTM_SESSION_KEYS[field]] = value;
  }
  const optIn = args.p_school_of_gaming_marketing_opt_in;
  if (optIn !== undefined) {
    metadata.schoolOfGamingMarketingOptIn = optIn ? "true" : "false";
  }
  return metadata;
}

/**
 * Read the answers back off a completed session's metadata, as the RPC
 * parameters. Throws when a key holds something the checkout route never
 * writes, so the webhook answers 500 and the mismatch is seen rather than a
 * seat being written with an answer nobody gave.
 */
export function seatAnswerArgsFromSessionMetadata(
  metadata: Record<string, string> | null,
): SeatAnswerArgs {
  const parsed = seatAnswersSessionMetadata.safeParse(metadata ?? {});
  if (!parsed.success) {
    throw new Error(
      `Checkout Session seat answers have an unexpected shape: ${parsed.error.message}`,
    );
  }
  const args: SeatAnswerArgs = {};
  for (const field of UTM_FIELDS) {
    const value = parsed.data[UTM_SESSION_KEYS[field]];
    if (value !== undefined) args[`p_${UTM_QUERY_PARAMS[field]}`] = value;
  }
  const optIn = parsed.data.schoolOfGamingMarketingOptIn;
  if (optIn !== undefined) {
    args.p_school_of_gaming_marketing_opt_in = optIn === "true";
  }
  return args;
}

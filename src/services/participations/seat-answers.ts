import type { ConsentState } from "@/lib/consent";
import {
  UTM_FIELDS,
  UTM_QUERY_PARAMS,
  utmMetadataForConsent,
  type UtmField,
  type UtmInput,
} from "@/lib/utm";

/**
 * What a booking records beyond who and what — the visit's UTM tag and the
 * School of Gaming mailing answer — as the parameters `create_booking` takes.
 *
 * A key is present only when it holds a value, so an absent one reaches the
 * RPC's DEFAULT NULL: no consent, no tag, or a product that did not ask.
 */
export type SeatAnswerArgs = Partial<
  Record<`p_${(typeof UTM_QUERY_PARAMS)[UtmField]}`, string>
> & { p_school_of_gaming_marketing_opt_in?: boolean };

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

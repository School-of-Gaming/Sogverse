import "server-only";

import type { SupabaseClient, UserIdentity } from "@supabase/supabase-js";
import { parseConsentCookieHeader } from "@/lib/consent";
import { UTM_QUERY_PARAMS, utmMetadataForConsent } from "@/lib/utm";
import type { Database } from "@/types/database.types";
import type { RegistrationUtmBody } from "./parent-registration.contracts";

/**
 * What the two registration-completion routes — parent and Gedu — share: the
 * account they finish already exists, created by an identity provider (Google)
 * with no name, terms, consents or attribution, and each route supplies the
 * missing part and then marks the account registered.
 */

/**
 * Whether the identity provider that created this account vouched for the
 * address the profile holds: a `google` identity reporting its email verified,
 * and that email being the profile's own, compared case-insensitively.
 *
 * A failed lookup answers `false` — the account is then mailed a verification
 * link it did not strictly need, which is the safe direction to be wrong in.
 */
export async function isEmailVerifiedByGoogle(
  admin: Pick<SupabaseClient<Database>, "auth">,
  userId: string,
  profileEmail: string,
): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("[registration-completion] could not read the auth user", error);
    return false;
  }
  return hasGoogleVerifiedAddress(data.user.identities, profileEmail);
}

/**
 * The comparison itself, over identities already in hand: a `google` identity
 * that reports its email verified, the email being `profileEmail`, compared
 * case-insensitively. The OAuth callback asks this of the user its code
 * exchange returned, so it needs no second read.
 */
export function hasGoogleVerifiedAddress(
  identities: readonly UserIdentity[] | undefined,
  profileEmail: string,
): boolean {
  const google = (identities ?? []).find(
    (identity) => identity.provider === "google",
  );
  const identityData: Record<string, unknown> = google?.identity_data ?? {};
  return (
    identityData.email_verified === true &&
    typeof identityData.email === "string" &&
    identityData.email.toLowerCase() === profileEmail.toLowerCase()
  );
}

/** The three `profiles.utm_*` columns a completion may write, each only if present. */
export interface UtmProfileColumns {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/**
 * The attribution columns for the account's one and only UTM write.
 *
 * **Consent-gated exactly as signup metadata is**, through the one exported
 * gate, read off this request's own `Cookie` header: counsel reads the landing
 * link's UTM parameters as tracking under the marketing purpose, so without a
 * stored marketing grant every key is omitted and the columns stay NULL. The
 * columns are write-once and a provider-created row arrives with them NULL, so
 * this is their first write, not an overwrite.
 */
export function utmProfileColumns(
  request: Request,
  utm: RegistrationUtmBody | undefined,
): UtmProfileColumns {
  const metadata = utmMetadataForConsent(
    parseConsentCookieHeader(request.headers.get("cookie")),
    utm,
  );
  // The gate omits a key that did not survive, so presence is the test.
  const columns: UtmProfileColumns = {};
  if (Object.hasOwn(metadata, UTM_QUERY_PARAMS.source)) {
    columns.utm_source = metadata[UTM_QUERY_PARAMS.source];
  }
  if (Object.hasOwn(metadata, UTM_QUERY_PARAMS.medium)) {
    columns.utm_medium = metadata[UTM_QUERY_PARAMS.medium];
  }
  if (Object.hasOwn(metadata, UTM_QUERY_PARAMS.campaign)) {
    columns.utm_campaign = metadata[UTM_QUERY_PARAMS.campaign];
  }
  return columns;
}

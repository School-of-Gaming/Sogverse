import "server-only";

/**
 * Where a landing page's email sign-up sends a reader in Klaviyo. The same for
 * every page and the deployment's, so it lives in the environment:
 *
 * - `KLAVIYO_PRIVATE_API_KEY` — a private key with the profiles, lists and
 *   subscriptions write scopes, read by the Klaviyo client itself.
 * - `KLAVIYO_NEWSLETTER_LIST_ID` — the single opt-in list a reader joins.
 */

export interface SubscribeConfig {
  listId: string;
}

const KEY_VAR = "KLAVIYO_PRIVATE_API_KEY";
const LIST_VAR = "KLAVIYO_NEWSLETTER_LIST_ID";

/**
 * The sign-up configuration, or the names of the variables that are unset.
 * Unset is a refusal, never a silent success: a form that answered "you are
 * signed up" with nowhere to send the address would lose every sign-up without
 * anyone noticing.
 */
export function readSubscribeConfig():
  | { ok: true; config: SubscribeConfig }
  | { ok: false; missing: string[] } {
  const key = process.env[KEY_VAR]?.trim() ?? "";
  const listId = process.env[LIST_VAR]?.trim() ?? "";
  if (key !== "" && listId !== "") return { ok: true, config: { listId } };
  return {
    ok: false,
    missing: [...(key === "" ? [KEY_VAR] : []), ...(listId === "" ? [LIST_VAR] : [])],
  };
}

/**
 * The custom profile properties a sign-up writes, by what they hold. The UTM
 * values go alongside them under their query-parameter names (`utm_source`, …).
 */
export const SIGNUP_PROPERTIES = {
  /** The landing page's id: never changes, so a segment built on it outlives a new slug. */
  pageId: "landing_page_id",
} as const;

/** The source Klaviyo records on the consent a sign-up gives. */
export const SIGNUP_CUSTOM_SOURCE = "Sogverse landing page sign-up form";

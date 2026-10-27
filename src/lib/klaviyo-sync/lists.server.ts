import "server-only";
import { klaviyoEnvironment, type KlaviyoList } from "./contract";

/**
 * **Which Klaviyo lists this deployment writes to, by id.** The ids live in
 * the environment, so a list recreated in Klaviyo is a variable changed, not a
 * deploy.
 *
 * - `KLAVIYO_MARKETING_CONSENT_LIST_ID` — the list a subscription joins: a
 *   registration with the box ticked, and a landing page's newsletter form.
 *   Production's is `SV Marketing consent`; everywhere else it is
 *   `SV Staging`.
 * - `KLAVIYO_ACCOUNT_LIST_ID`, `KLAVIYO_CLUB_LIST_ID`, `KLAVIYO_CAMP_LIST_ID`,
 *   `KLAVIYO_MUNICIPAL_CLUB_LIST_ID` — production's history lists, set on the
 *   production deployment alone. Staging writes no list but `SV Staging`.
 *
 * An unset id is a failure, never a skip: the row records which variable is
 * missing and retries, so a list nobody configured cannot quietly stay empty.
 */

export const MARKETING_CONSENT_LIST_VAR = "KLAVIYO_MARKETING_CONSENT_LIST_ID";

const HISTORY_LIST_VARS = {
  account: "KLAVIYO_ACCOUNT_LIST_ID",
  club: "KLAVIYO_CLUB_LIST_ID",
  camp: "KLAVIYO_CAMP_LIST_ID",
  municipalClub: "KLAVIYO_MUNICIPAL_CLUB_LIST_ID",
} as const satisfies Record<KlaviyoList, string>;

function listId(variable: string): string {
  const id = process.env[variable]?.trim() ?? "";
  if (id === "") throw new Error(`${variable} is not set`);
  return id;
}

/** The list a subscription joins: `SV Marketing consent`, or `SV Staging`. */
export function marketingConsentListId(): string {
  return listId(MARKETING_CONSENT_LIST_VAR);
}

/**
 * The ids of the lists a profile sync adds the parent to: the history lists
 * the contract names, in production; the one staging list everywhere else.
 */
export function listIdsFor(lists: readonly KlaviyoList[]): string[] {
  if (klaviyoEnvironment() !== "production") return [marketingConsentListId()];
  return lists.map((list) => listId(HISTORY_LIST_VARS[list]));
}

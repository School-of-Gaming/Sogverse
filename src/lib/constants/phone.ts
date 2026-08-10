import type { Country } from "react-phone-number-input";
import type { FlagCountry } from "@/components/ui/flags";

/**
 * A country the phone-number field will accept a number from. Typed against
 * both registries it has to satisfy: `FlagCountry` (we own a flag for it — see
 * src/components/ui/flags.ts) and react-phone-number-input's `Country` (it
 * knows the dialling code and national format).
 */
export type PhoneCountry = FlagCountry & Country;

/**
 * Countries offered in the phone-number country dropdown, in the order they
 * appear. Finland is the default selection (see the phone input component).
 *
 * **Deliberately not the locale list.** The two drift on purpose and neither is
 * derived from the other:
 *   - `US` is here with no matching UI locale — plenty of families type a US
 *     number, none of them need the app in a US locale.
 *   - `tlh` is a UI locale with no country at all, so it could never appear
 *     here.
 * Shipping a new locale therefore does *not* imply adding its country here —
 * ask whether we expect phone numbers from there, and answer that separately.
 */
export const PHONE_COUNTRIES = [
  "FI",
  "FR",
  "GB",
  "SE",
  "US",
] as const satisfies readonly PhoneCountry[];

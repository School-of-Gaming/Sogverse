import "server-only";
import { cookies } from "next/headers";
import {
  CONSENT_COOKIE_NAME,
  parseConsentCookie,
  type ConsentState,
} from "@/lib/consent";

/**
 * Server-side mirror of `useConsent()` — the same cookie, parsed by the same
 * function, so the server render and the first client render agree about which
 * scripts are allowed to mount and nothing appears (or disappears) at
 * hydration.
 *
 * `null` means the visitor has not answered a question of this version yet:
 * nothing runs, and the banner asks.
 */
export async function getServerConsent(): Promise<ConsentState | null> {
  const cookieStore = await cookies();
  return parseConsentCookie(cookieStore.get(CONSENT_COOKIE_NAME)?.value);
}

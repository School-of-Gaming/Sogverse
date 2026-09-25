import { NextResponse } from "next/server";

/**
 * The registration intent cookie: what an account created through Google set
 * out to register as — the finish page's query, as the OAuth callback built it
 * (the Gedu variant, the landing link's attribution, the product page to
 * return to), every part already sanitised.
 *
 * **Why it exists.** The address is the intent's first carrier, but the
 * proxy's registration gate bounces an owing account to a bare finish page, so
 * a would-be Gedu who wandered off would come back to the parent form. The
 * finish page falls back to this cookie for whatever its address lacks.
 *
 * **Who writes it.** The callback, whenever it sends an owing account to the
 * finish page; the two completion routes expire it once the account has
 * registered. It is never a credential — the finish page re-reads it through
 * the same sanitisers as its own address — but it is httpOnly all the same,
 * since no script has a reason to read it.
 */

export const REGISTRATION_INTENT_COOKIE_NAME = "sog_registration_intent";

/** Long enough to finish a form in; an account that has not is sent back. */
const REGISTRATION_INTENT_MAX_AGE_SECONDS = 6 * 60 * 60;

/**
 * Attributes for a server-side write. `secure` follows the environment, as the
 * app's other cookies do: a `Secure` cookie is dropped on `http://localhost`.
 */
export function registrationIntentCookieOptions() {
  return {
    path: "/",
    maxAge: REGISTRATION_INTENT_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  } as const;
}

/**
 * A completion route's success answer: the account has registered, so the
 * intent it was carrying expires on the same response.
 */
export function registrationCompletedResponse(): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(REGISTRATION_INTENT_COOKIE_NAME, "", {
    ...registrationIntentCookieOptions(),
    maxAge: 0,
  });
  return response;
}

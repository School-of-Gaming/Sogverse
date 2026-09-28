import "server-only";

import type { User } from "@supabase/supabase-js";

/**
 * Whether GoTrue refused a create or an address change because the address
 * already belongs to another account.
 *
 * Read the machine-readable code first — `email_exists` is what current GoTrue
 * sends — and fall back to the message, because the code is a relatively recent
 * addition and an older deployment (or a proxy that drops it) still says the
 * same thing in prose. Getting this wrong costs a generic failure where a
 * specific refusal was due, not a security property: GoTrue has refused the
 * write either way.
 */
export function isEmailAlreadyRegistered(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "email_exists") return true;
  return (
    "message" in error &&
    typeof error.message === "string" &&
    /already( been)? registered/i.test(error.message)
  );
}

/**
 * The addresses an auth user's identities answer to — the half of an address
 * change that sign-in actually reads.
 *
 * `auth.identities.email` is a generated column over `identity_data->>'email'`,
 * so it is the one place a move can land on `auth.users` and still leave
 * sign-in on the old address. Read it off a **fresh** `getUserById`, never off
 * an `updateUserById` response: that payload carries the identities as they
 * were before the write, so checking it there reports a failure on every
 * successful move.
 *
 * `identity_data` is loosely typed by the SDK, so it is read defensively rather
 * than asserted onto a shape.
 */
export function identityEmails(user: User): string[] {
  return (user.identities ?? [])
    .map((identity) => identity.identity_data?.["email"])
    .filter((email): email is string => typeof email === "string");
}

/** Whether a fresh auth read shows an identity on `email`, compared caselessly. */
export function identitiesHoldEmail(user: User, email: string): boolean {
  const wanted = email.toLowerCase();
  return identityEmails(user).some((held) => held.toLowerCase() === wanted);
}

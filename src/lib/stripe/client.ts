import "server-only";
import Stripe from "stripe";

/**
 * The Stripe API version every **outbound** call from this codebase is made
 * against.
 *
 * Pinning it here decouples our requests from the Stripe account's default
 * version, which is otherwise what an unpinned client tracks — so an account
 * upgrade (Stripe prompts for one in the dashboard) would silently reshape every
 * response we read. The literal must be the one the installed SDK's types
 * describe: the SDK ships response types for exactly one version, and the
 * `apiVersion` option is typed to that same literal, so TypeScript rejects any
 * other value and an SDK upgrade surfaces here as a compile error rather than as
 * a runtime shape mismatch.
 *
 * **This governs outbound calls only.** The shape of an incoming *webhook*
 * payload is decided by the version pinned on the webhook endpoint (or, for an
 * unpinned endpoint, by the account default) — nothing about this constant
 * changes what Stripe posts to us. Handlers therefore have to read both the old
 * and new shapes of anything Stripe has moved.
 */
export const STRIPE_API_VERSION = "2025-02-24.acacia";

/**
 * The single Stripe client. One instance per server process, shared by every
 * caller, so the pinned version above cannot drift between call sites.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: STRIPE_API_VERSION,
});

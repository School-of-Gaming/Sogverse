import "server-only";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import type { GamerSignIn } from "@/types";

/**
 * Who a family mail goes to, decided in one place.
 *
 * **We never write to a child alone.** Every mail about a seat goes to the
 * parent — the linked parent for a child's seat, the adult themselves for a
 * seat they hold in their own name — and *in addition* the child receives
 * their own copy when, and only when, they hold a mailbox of their own that we
 * have seen answer. A seat with no parent contact produces no mail at all,
 * whatever the child holds: a verified address is not a reason to start
 * corresponding with a child on their own.
 *
 * **The child's copy is gated on two facts together, and the second is
 * load-bearing.** A parent chooses how each child signs in, and one of the
 * choices is the child's real email address; that address is *typed* by the
 * parent and only *proven* when the child follows the verification link we
 * send to it. Until then it is a string somebody typed, and a mistyped one
 * belongs to a stranger — so a session report, a seat offer or a confirmation
 * sent to it would be a mail about a named child landing in an unknown inbox.
 * The sign-in mode alone is therefore never enough: the copy goes out only
 * when the stored mode is the real-email one AND the verification stamp is
 * set. A parent who later switches the child back to another mode takes the
 * copy away with it, because the mode is checked on every send.
 *
 * **What the child's copy is, is the template's decision, not this module's.**
 * This resolves *who*; each mail decides what a child's copy may carry — and
 * the standing rule there is that anything only a parent can act on (an
 * accept/decline token, a billing link) stays out of it. A recipient's `kind`
 * is how a caller renders the right variant and picks the right My SOG root,
 * since role routing bounces a child off a `/parent` URL.
 *
 * **The parent is always first in the list.** A parent-only outcome and a
 * parent-and-child outcome differ only by what is appended, so a caller that
 * treats the first entry as the seat's contact keeps working unchanged.
 *
 * A gedu never sees any of this: the roster shows a child's seat under the
 * parent's address whatever the child's own sign-in is, and nothing here
 * changes that.
 *
 * Pure by design. Callers already read the profiles a send needs and in
 * different shapes (one seat, or a whole group in one trip), so the decision
 * takes the read rows rather than a client, and a unit test can hold every
 * branch without a database.
 */

export type FamilyRecipientKind = "parent" | "gamer";

/** One person one family mail goes to, with the locale and name to render it for. */
export interface FamilyRecipient {
  email: string;
  kind: FamilyRecipientKind;
  locale: SupportedLocale;
  firstName: string;
}

/** A linked parent, or the adult holding their own seat — as the caller read them. */
export interface FamilyParentContact {
  email: string;
  firstName: string;
  /** `profiles.locale`, untrusted until resolved. */
  locale: string | null;
}

/** The child on the seat — the fields that decide whether they get a copy of their own. */
export interface FamilyGamerContact {
  /**
   * `profiles.email`. Under the real-email sign-in this is the address the
   * parent gave; under the other two it is a platform-internal handle no inbox
   * answers, which the gate below never lets through.
   */
  email: string;
  firstName: string;
  locale: string | null;
  /** `gamer_profiles.sign_in`; null when the row is missing (an adult, or a broken profile). */
  signIn: GamerSignIn | null;
  /** `profiles.email_verified_at` — the proof the address is the child's. */
  emailVerifiedAt: string | null;
}

/**
 * Whether a child holds a mailbox we may write to: the real-email sign-in,
 * AND a verification stamp. See the module comment for why both.
 */
export function gamerHoldsOwnMailbox(
  gamer: Pick<FamilyGamerContact, "signIn" | "emailVerifiedAt">,
): boolean {
  return gamer.signIn === "email" && Boolean(gamer.emailVerifiedAt);
}

/**
 * The recipients of one seat's mail: the parent(s) first, then the child when
 * they hold a mailbox of their own. Empty when there is no parent to write to.
 *
 * `fallbackLocale` is what a recipient with no stored preference is rendered
 * in — the request's `Accept-Language` where a caller has one, the default
 * locale where it does not.
 */
export function resolveFamilyRecipients({
  parents,
  gamer,
  fallbackLocale,
}: {
  parents: readonly FamilyParentContact[];
  /** Null on an adult's own seat: there is no child to copy. */
  gamer: FamilyGamerContact | null;
  fallbackLocale: SupportedLocale;
}): FamilyRecipient[] {
  if (parents.length === 0) return [];

  const recipients: FamilyRecipient[] = parents.map((parent) => ({
    email: parent.email,
    kind: "parent",
    locale: resolveLocale(parent.locale, fallbackLocale),
    firstName: parent.firstName,
  }));

  if (gamer && gamerHoldsOwnMailbox(gamer)) {
    recipients.push({
      email: gamer.email,
      kind: "gamer",
      locale: resolveLocale(gamer.locale, fallbackLocale),
      firstName: gamer.firstName,
    });
  }

  return recipients;
}

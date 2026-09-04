import "server-only";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import type { GamerSignIn } from "@/types";

/**
 * Who a family mail goes to, decided in one place.
 *
 * **We never write to a child alone.** Every mail about a seat goes to the
 * parent — the linked parent for a child's seat, the adult themselves for a
 * seat they hold in their own name — and *in addition* the child receives their
 * own copy when they hold a mailbox of their own. A seat with no parent contact
 * produces no mail at all, whatever the child holds: a child's own address is
 * not a reason to start corresponding with a child on their own.
 *
 * **The child's copy is gated on one fact: the stored sign-in mode is the
 * real-email one.** A parent chooses how each child signs in, and one of the
 * choices is the child's own email address; the other two are a
 * platform-internal handle no inbox answers, which the gate below never lets
 * through. A parent who later switches the child back to another mode takes the
 * copy away with it, because the mode is checked on every send.
 *
 * **Verification is deliberately not a precondition.** The address is typed by
 * the parent and only proven when the child follows the verification link, and
 * gating the copy on that stamp was a special case this one role carried alone.
 * It cost the copy exactly where it is most useful — a confirmation sent
 * moments after a parent creates the account, before the child has clicked
 * anything at all — and children cannot be relied on to verify. So the mode is
 * the whole test, and an unverified real address receives the copy.
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
}

/**
 * Whether a child holds a mailbox we may write to: the real-email sign-in, and
 * nothing else. See the module comment for why verification is not part of it.
 */
export function gamerHoldsOwnMailbox(gamer: Pick<FamilyGamerContact, "signIn">): boolean {
  return gamer.signIn === "email";
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

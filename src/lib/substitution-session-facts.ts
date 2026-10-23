import { formatInTimeZone } from "date-fns-tz";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import type {
  SessionProductDocument,
} from "@/services/session-substitution/session-substitution.contracts";
import type {
  ProductTopic,
  ProductType,
  SpokenLanguageCode,
} from "@/types";

/**
 * **What every substitution surface says about the session itself** — the
 * gedus' pool, the admin Substitutions page and a sub's own card on My SOG.
 *
 * The three reads hand over one product shell, and this is the one place it
 * becomes the facts a reader is shown: the name in the reader's locale, the
 * kind, topic and spoken language, online or where, and when. Each surface used
 * to derive its own, and they drifted — the admin page once could not say
 * whether a session was online. A fact added here reaches every frame that
 * renders it, and the shared facts component is what renders it.
 *
 * **Nothing about a person is here, and nothing a role pays.** Who is absent,
 * why, who offered and the fee each travel under their own read's disclosure
 * rules, and stay in each surface's own frame.
 *
 * Pure, and clock-free: how soon a session is, and whether that is urgent, are
 * questions for the moment of render.
 */

/** The facts about one session, already in the reader's locale. */
export interface SessionFacts {
  /**
   * Product-local `YYYY-MM-DD` — the session's identity on every substitution
   * row, and what an orphan falls back to stating.
   */
  sessionDate: string;
  /** The product's own zone, which `sessionDate` is a date in. */
  timezone: string;
  /**
   * When the session runs, or `null` where the plan has no session on that
   * date — an orphaned date, after the schedule moved off its weekday, or one
   * outside the term — which every surface still shows, by its date alone.
   */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Translated, through the usual locale → English → first-row fallback. */
  productName: string;
  productType: ProductType;
  topic: ProductTopic;
  spokenLanguageCode: SpokenLanguageCode;
  isRemote: boolean;
  /**
   * The venue on an in-person product. `null` on a remote one, and `null` on an
   * in-person product with no site recorded — which is "place to be confirmed",
   * not "online": `isRemote` is what says online.
   */
  siteName: string | null;
}

/**
 * The product shell as this derivation reads it — the camel-cased half of a
 * {@link SessionProductDocument} that describes a session.
 *
 * Its own shape rather than the wire document because the sub's seat read
 * reaches the roll-up already camel-cased, beside the run-shaped fields an
 * assignment card needs; the two wire-facing readers adapt through
 * {@link sessionFactsProduct}.
 */
export interface SessionFactsProduct {
  productType: ProductType;
  topic: ProductTopic;
  spokenLanguageCode: SpokenLanguageCode;
  timezone: string;
  isRemote: boolean;
  siteName: string | null;
  translations: readonly { locale: string; name: string }[];
}

/** The wire document, in the shape {@link buildSessionFacts} reads. */
export function sessionFactsProduct(
  document: SessionProductDocument,
): SessionFactsProduct {
  return {
    productType: document.product_type,
    topic: document.topic,
    spokenLanguageCode: document.spoken_language_code,
    timezone: document.timezone,
    isRemote: document.is_remote,
    siteName: document.site_name,
    translations: document.translations,
  };
}

/**
 * A read's session instants, as the database's plan states them, back as
 * `Date`s — both `null` on a date the plan no longer has.
 */
export function sessionWindowOf(row: {
  starts_at: string | null;
  ends_at: string | null;
}): { startsAt: Date | null; endsAt: Date | null } {
  return {
    startsAt: row.starts_at === null ? null : new Date(row.starts_at),
    endsAt: row.ends_at === null ? null : new Date(row.ends_at),
  };
}

/**
 * One session's facts: the product it belongs to, on the product-local date it
 * is keyed by, running between the instants the read carried for it.
 *
 * The instants are the database's — every read behind these surfaces states
 * the session's window from the plan — so the pool, the admin page and the
 * sub's card cannot disagree about when a session is, orphan included.
 */
export function buildSessionFacts({
  product,
  sessionDate,
  startsAt,
  endsAt,
  locale,
}: {
  product: SessionFactsProduct;
  /** Product-local `YYYY-MM-DD`. */
  sessionDate: string;
  /** `null`, both of them, on a date the plan no longer has. */
  startsAt: Date | null;
  endsAt: Date | null;
  locale: SupportedLocale;
}): SessionFacts {
  return {
    sessionDate,
    timezone: product.timezone,
    startsAt,
    endsAt,
    productName: resolveRequiredTranslation(product.translations, locale).name,
    productType: product.productType,
    topic: product.topic,
    spokenLanguageCode: product.spokenLanguageCode,
    isRemote: product.isRemote,
    // Never a building on a remote product, whatever the row says: a session
    // with a room has no venue, and a line naming both would claim it meets in
    // two places. The reads already apply this; the facts do not depend on it.
    siteName: product.isRemote ? null : product.siteName,
  };
}

/**
 * The session's clock face, `HH:MM–HH:MM` in the given zone — or `null` for an
 * orphaned date, which has no time to state and must not be given a guessed one.
 *
 * 24-hour and locale-blind, as the admin schedule chips are: on the dense admin
 * list the times are a column to be scanned rather than a sentence to be read,
 * and that page states its one zone above every row rather than beside each.
 * The en dash is punctuation that reads identically in every locale and stays
 * out of the catalog.
 */
export function sessionClockFace(
  facts: Pick<SessionFacts, "startsAt" | "endsAt">,
  timeZone: string,
): string | null {
  if (facts.startsAt === null || facts.endsAt === null) return null;
  const start = formatInTimeZone(facts.startsAt, timeZone, "HH:mm");
  const end = formatInTimeZone(facts.endsAt, timeZone, "HH:mm");
  return `${start}–${end}`;
}

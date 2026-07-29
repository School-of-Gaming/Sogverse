import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { MyWaitlistRow } from "@/services/participations";

/**
 * One card in the dashboard's "On the waitlist" band. The waitlist counterpart
 * to `UpcomingSessionEntry`, and deliberately a much smaller job: a waitlisted
 * row has no schedule to expand, so there is no occurrence enumeration, no
 * clock, and one entry per row rather than one per (row × slot × occurrence).
 * All this layer does is resolve the product name into the viewer's locale —
 * which is why it lives here and not in the query cache, keeping the cache key
 * locale-free exactly as the sessions path does.
 */
export interface WaitlistEntry {
  /** The `participations.id` — React key, and what the leave action names. */
  participationId: string;
  gamerFirstName: string;
  /** The gamer's UUID; seeds the identicon so it survives name edits. */
  gamerSeed: string;
  productName: string;
  /** 1-based position in line, recomputed live by the RPC behind the read. */
  position: number;
}

/**
 * Resolve the viewer's waitlisted rows into cards. Order is preserved from the
 * read (oldest waitlist stamp first), so the band stays stable across refetches
 * and a position ticking down never reorders the list.
 */
export function toWaitlistEntries(
  rows: MyWaitlistRow[],
  locale: SupportedLocale,
): WaitlistEntry[] {
  return rows.map((row) => ({
    participationId: row.participationId,
    gamerFirstName: row.gamer.firstName,
    gamerSeed: row.gamer.id,
    // Same fallback as the sessions expander: a product with no translation in
    // any locale renders a nameless card rather than dropping the row, because
    // the position is the part the parent came for.
    productName: resolveTranslation(row.product.translations, locale)?.name ?? "",
    position: row.position,
  }));
}

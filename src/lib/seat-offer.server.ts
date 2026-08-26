import "server-only";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { isSeatOfferTokenExpired, readSeatOfferToken } from "@/lib/seat-offer-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What the seat-offer landing page renders, resolved on the server before the
 * first frame.
 *
 * Three states, and the split between the last two is a copy decision rather
 * than a technical one: an `expired` offer was real and the family missed it,
 * so the page can say so and name the window; an `invalid` link says nothing
 * about anything, because the alternative is a public page that tells a
 * stranger which participation ids exist.
 */
export type SeatOfferLinkState =
  | {
      kind: "offer";
      /** Whoever holds the queued place — a child, or the parent themselves. */
      participantName: string;
      /** True when the queued place is the reader's own seat. */
      isSelfSeat: boolean;
      productName: string;
      /** The instant the window closes. Formatted by the page, in the zone below. */
      deadline: Date;
      /**
       * The product's zone, and the same one the mail used. A landing page
       * COULD render the deadline in the reader's own zone — it has a browser —
       * but then the page and the mail would state two different clock faces
       * for one moment, and a family checking one against the other would have
       * every reason to distrust both.
       */
      timeZone: string;
    }
  | { kind: "expired" }
  | { kind: "invalid" };

/**
 * Read an emailed seat-offer link and say what the page should show.
 *
 * **Nothing here writes.** The link only opens a page; the answer is a POST
 * behind a button, because accepting a seat is not idempotent and grants
 * something — an inbox scanner prefetching the URL must reach exactly this
 * function and stop.
 *
 * Session-agnostic by construction, on the admin client: the signed token is
 * the authorization, and the reader may be signed out or signed in as their own
 * child on a shared device. The route behind the buttons repeats every check
 * made here, so this is purely the UI gate and is not trusted on its own.
 */
export async function resolveSeatOfferLink(
  token: string | null,
  locale: SupportedLocale,
): Promise<SeatOfferLinkState> {
  const claims = await readSeatOfferToken(token);
  if (!claims) return { kind: "invalid" };

  const { data } = await createAdminClient()
    .from("participations")
    .select(
      `
        id,
        status,
        customer_id,
        participant_id,
        seat_offer_sent_at,
        product:products!inner(timezone, product_translations(locale, name)),
        participant:profiles!participations_participant_id_fkey!inner(first_name)
      `,
    )
    .eq("id", claims.participationId)
    .maybeSingle();

  // The row is gone (declined, or removed), has taken its seat, or carries a
  // different offer than this link was minted for — a re-offer replaces the
  // stamp, which is what retires the previous link with no revocation list.
  // All of them are one answer.
  if (!data || data.status !== "waitlisted" || !data.seat_offer_sent_at) {
    return { kind: "invalid" };
  }
  if (new Date(data.seat_offer_sent_at).getTime() !== claims.sentAtMs) {
    return { kind: "invalid" };
  }

  // Checked after the row, not before: an expired link whose offer has since
  // been answered is `invalid`, because there is no longer an offer to have
  // missed.
  if (isSeatOfferTokenExpired(claims, Date.now())) return { kind: "expired" };

  const productName = resolveTranslation(
    data.product.product_translations,
    locale,
  )?.name;
  const participantName = data.participant.first_name.trim();

  // Both are guaranteed by the schema — a product has at least one translation
  // row and `profiles.first_name` is NOT NULL — so this is a shape the data
  // model says cannot arrive. If it does, a page asking a family about an
  // unnamed child is worse than one saying the link did not work.
  if (!productName || !participantName) return { kind: "invalid" };

  return {
    kind: "offer",
    participantName,
    isSelfSeat: data.participant_id === data.customer_id,
    productName,
    deadline: new Date(claims.sentAtMs + SEAT_OFFER_WINDOW_MS),
    timeZone: data.product.timezone,
  };
}

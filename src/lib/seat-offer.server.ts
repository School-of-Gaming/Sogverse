import "server-only";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  isSeatOfferTokenExpired,
  readSeatOfferToken,
  type SeatOfferTokenClaims,
} from "@/lib/seat-offer-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppSupabaseClient, ParticipationStatus } from "@/types";

/**
 * Where a link whose SIGNATURE is good has ended up, when it is not a live
 * offer any more.
 *
 * Three answers rather than one, and the split is the point:
 *
 * - `expired` — the offer was real, the five days ran out, and the row is still
 *   sitting in the queue holding this exact stamp. Not a full stop: the family
 *   can still decline from here, so the page it names asks a question.
 * - `used` — the offer has been consumed. Accepted, promoted by an admin,
 *   declined, withdrawn, or replaced by a newer invitation. **Which one is
 *   deliberately not said.** A parent re-opening the mail of an offer their
 *   family already answered must not be told it expired, and equally does not
 *   need their own history narrated back at them by a page with no session on
 *   it — the card sends them to My SOG, where that truth actually lives.
 * - `invalid` — we could not read the link at all.
 *
 * **The `used`/`invalid` line is where the security argument sits.** A valid
 * HMAC proves we minted this link for this offer, so telling its holder the
 * offer is over is telling them about their own row. A bad signature is told
 * nothing, which is what keeps the endpoint from confirming that any given
 * participation id exists.
 */
export type SeatOfferDeadEnd = "expired" | "used" | "invalid";

/**
 * What the seat-offer landing page renders, resolved on the server before the
 * first frame.
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
  // Spelled out one member per kind rather than `{ kind: SeatOfferDeadEnd }`:
  // a discriminant that is itself a union does not discriminate, so the page
  // could not narrow away the offer arm and read the fields above.
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "invalid" };

/** The row facts the classification reads, and the only ones it needs. */
interface SeatOfferRowFacts {
  status: ParticipationStatus;
  seat_offer_sent_at: string | null;
}

/**
 * What a correctly-signed token means, given the row it names.
 *
 * Pure, and shared by the two callers below so the page a family lands on and
 * the page their button leaves them on cannot disagree about the same link.
 *
 * A valid signature is what makes `used` the default rather than `invalid`: we
 * only ever minted this token against a real offer on a real row, so every
 * shape that is not "still holding this exact offer" is that offer having been
 * consumed. There is no shape left here that means "no such thing".
 */
function classifySeatOffer(
  row: SeatOfferRowFacts | null,
  claims: SeatOfferTokenClaims,
  nowMs: number,
): SeatOfferDeadEnd | "live" {
  // The row is gone — declined, left, or cascaded away with its product.
  if (!row) return "used";

  // The seat is theirs. `chk_participations_offer_only_when_waitlisted` makes
  // the status the whole test: an active row cannot still be carrying an offer
  // stamp, so there is nothing left to compare. This covers the family who
  // accepted and the family an admin drag-promoted alike, which is right — the
  // child has the seat either way.
  if (row.status !== "waitlisted" || !row.seat_offer_sent_at) return "used";

  // Still queued, but carrying a different offer than this link was minted for.
  // Stored can only ever be NEWER — every token is signed over a stored stamp
  // and a re-offer replaces it — so a disagreement means a second invitation
  // went out and this link is the older of the two.
  if (new Date(row.seat_offer_sent_at).getTime() !== claims.sentAtMs) {
    return "used";
  }

  // Checked last, so an expired link whose offer has since been answered says
  // what happened to it rather than what it missed.
  return isSeatOfferTokenExpired(claims, nowMs) ? "expired" : "live";
}

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

  // Restates the first line of `classifySeatOffer` — a missing row is a used
  // offer — for the compiler's benefit rather than the reader's: the fields
  // below are only reachable once `data` is known to be there.
  if (!data) return { kind: "used" };

  const state = classifySeatOffer(data, claims, Date.now());
  if (state !== "live") return { kind: state };

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

/**
 * What a token the compare-and-swap refused now means.
 *
 * The other half of {@link resolveSeatOfferLink}, for the respond route: a
 * family answering from a tab opened while the offer was live can find the row
 * has moved under them, and the panel they land on should say exactly what
 * re-opening the mail would have said.
 */
export async function resolveSeatOfferDeadEnd(
  claims: SeatOfferTokenClaims,
  client: AppSupabaseClient,
): Promise<SeatOfferDeadEnd> {
  const { data } = await client
    .from("participations")
    .select("status, seat_offer_sent_at")
    .eq("id", claims.participationId)
    .maybeSingle();

  const state = classifySeatOffer(data, claims, Date.now());

  // `live` here is a row that still holds this exact offer inside its window,
  // which the compare-and-swap refused for the one reason it will not name: the
  // product was cancelled or deleted under the answer. Generic on purpose — a
  // distinguishable answer would let an unauthenticated caller ask which
  // products have been withdrawn.
  return state === "live" ? "invalid" : state;
}

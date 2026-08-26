import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import {
  DEFAULT_LOCALE,
  detectLocaleFromHeader,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  buildSeatOfferEmail,
  seatOfferSubject,
} from "@/lib/email-templates/seat-offer";
import {
  buildSeatOfferStaffEmail,
  seatOfferStaffSubject,
  type SeatOfferStaffReason,
} from "@/lib/email-templates/seat-offer-staff";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { createSeatOfferToken } from "@/lib/seat-offer-token";
import {
  claimedSeatOfferExpiries,
  type ClaimedSeatOfferExpiries,
} from "@/services/participations/seat-offer.contracts";
import { getOrigin } from "@/lib/url";
import { DAYS_OF_WEEK, formatDate } from "@/lib/utils";
import type { AppSupabaseClient } from "@/types";

/**
 * The three mails a seat offer produces, and the one read they all share.
 *
 * **They take ids and read everything themselves**, exactly as the signup
 * confirmation does and for the same reason: the value that decides who
 * receives a mail should be resolved in one place rather than at every call
 * site. Two of the three callers here are handling a row they have just written
 * and no longer own — a declined participation is *deleted* by the time this
 * runs — which makes reading by id the only shape that works at all.
 *
 * **Every one of them is wrapped, logged and swallowed.** The outcome each mail
 * follows is already committed: a seat has been offered, accepted, declined, or
 * quietly expired. A Brevo outage is never a reason to answer a family's click
 * with an error, or to hand an admin a 500 for a sweep that did its job.
 */

/** The client every send here reads through — always the privileged one. */
interface SeatOfferMailBase {
  /**
   * The admin client. Not a preference: the public respond route has no session
   * at all (the signed token is the authorization), and the staff mails name a
   * family whose row may already be gone. Every caller is a route that has
   * established who is acting before it gets here.
   */
  client: AppSupabaseClient;
  /**
   * The request the action arrived on. Read for two things, and passed whole so
   * neither can be got wrong at a call site: the TRUSTED origin (`getOrigin`,
   * never the raw Host — these links go in an email and one of them carries a
   * credential), and `Accept-Language` as the last step of the locale chain.
   */
  request: Request;
  customerId: string;
  participantId: string;
  productId: string;
}

export interface SeatOfferEmailInput extends SeatOfferMailBase {
  /** The row the link answers for — half of what the token is signed over. */
  participationId: string;
  /**
   * The stamp the RPC stored, verbatim. It is the other half, and it is
   * compared back on the click, so a value invented here would mint a mail
   * whose buttons cannot work — and it is what the deadline is derived from.
   */
  sentAt: string;
}

export interface SeatOfferStaffEmailInput extends SeatOfferMailBase {
  reason: SeatOfferStaffReason;
  /** When the offer went out, for the line an admin reads to place it. */
  sentAt: string;
}

/** The offer itself, to the parent. Never throws. */
export async function sendSeatOfferEmail(
  input: SeatOfferEmailInput,
): Promise<void> {
  try {
    await sendOffer(input);
  } catch (error) {
    console.error("[seat-offer email] send failed", {
      productId: input.productId,
      participantId: input.participantId,
      error,
    });
  }
}

/** The staff mail, either flavour. Never throws. */
export async function sendSeatOfferStaffEmail(
  input: SeatOfferStaffEmailInput,
): Promise<void> {
  try {
    await sendStaff(input);
  } catch (error) {
    console.error("[seat-offer staff email] send failed", {
      productId: input.productId,
      participantId: input.participantId,
      reason: input.reason,
      error,
    });
  }
}

/**
 * Claim every lapsed, un-notified offer and hand back what the mails need.
 *
 * The claim and the mark are one statement inside the RPC, so what comes back
 * is the set THIS caller owes a mail for — a concurrent sweep claims nothing.
 * Two callers use it and they need different halves: the admin sweep route
 * wants the count in its response, so it claims in the handler; the public
 * respond route wants nothing at all and lets {@link notifyExpiredSeatOffers}
 * do both after the answer has gone out.
 */
export async function claimExpiredSeatOffers(
  client: AppSupabaseClient,
): Promise<ClaimedSeatOfferExpiries> {
  const { data, error } = await client.rpc(
    "claim_expired_seat_offer_notifications",
  );
  if (error) throw error;
  return claimedSeatOfferExpiries.parse(data);
}

/**
 * Claim and mail in one go, swallowing everything.
 *
 * This is the lazy sweep's other trigger: a family clicking a link that has
 * already run out is itself an observation that it ran out, so the click does
 * the work an admin opening a page would otherwise have done. It sweeps
 * everything due rather than only the row that was clicked, because the claim
 * is global, idempotent and cheap — narrowing it would buy nothing and would
 * leave the rest waiting for somebody else to look.
 */
export async function notifyExpiredSeatOffers({
  client,
  request,
}: {
  client: AppSupabaseClient;
  request: Request;
}): Promise<void> {
  try {
    const claimed = await claimExpiredSeatOffers(client);
    await Promise.all(
      claimed.map((row) =>
        sendSeatOfferStaffEmail({
          client,
          request,
          reason: "no_response",
          customerId: row.customer_id,
          participantId: row.participant_id,
          productId: row.product_id,
          sentAt: row.sent_at,
        }),
      ),
    );
  } catch (error) {
    console.error("[seat-offer expiry sweep] failed", { error });
  }
}

/**
 * The facts both mails are built from. One query pair, because the people know
 * nothing about the product and a mail is already behind the thing it follows.
 * The payer and the participant come back in ONE query: on an adult's own seat
 * they are the same row.
 */
async function readContext(
  client: AppSupabaseClient,
  {
    customerId,
    participantId,
    productId,
  }: Pick<SeatOfferMailBase, "customerId" | "participantId" | "productId">,
) {
  const [productResult, peopleResult] = await Promise.all([
    client
      .from("products")
      .select(
        "product_type, timezone, product_translations(locale, name), schedule_slots(weekday, start_time)",
      )
      .eq("id", productId)
      // Embedded resources come back unordered, so a product with no
      // translation in the reader's locale or in English would otherwise
      // resolve its name from an arbitrary row. Alphabetical locale order is
      // arbitrary too, but it is stable, which is all the fallback needs.
      .order("locale", { referencedTable: "product_translations" })
      .single(),
    client
      .from("profiles")
      .select("id, first_name, last_name, email, locale")
      .in("id", [customerId, participantId]),
  ]);

  if (productResult.error) throw productResult.error;
  if (peopleResult.error) throw peopleResult.error;

  return {
    product: productResult.data,
    customer: peopleResult.data.find((row) => row.id === customerId),
    participant: peopleResult.data.find((row) => row.id === participantId),
  };
}

async function sendOffer({
  client,
  request,
  customerId,
  participantId,
  productId,
  participationId,
  sentAt,
}: SeatOfferEmailInput): Promise<void> {
  const { product, customer, participant } = await readContext(client, {
    customerId,
    participantId,
    productId,
  });

  // Nowhere to write to. Not an error: a customer profile with no address is a
  // state the database permits, and there is nothing to report to anyone.
  if (!customer?.email) return;

  // Stored preference → what the browser asked for → English. The same chain
  // every other send in the app walks.
  const locale: SupportedLocale = isSupportedLocale(customer.locale)
    ? customer.locale
    : detectLocaleFromHeader(request.headers.get("Accept-Language"));

  const productName = resolveTranslation(product.product_translations, locale)?.name;
  const participantName = participant?.first_name.trim();
  if (!productName || !participantName) {
    console.error("[seat-offer email] nothing to name — skipping the send", {
      productId,
      participantId,
      hasProductName: Boolean(productName),
    });
    return;
  }

  // The TRUSTED origin, never the raw Host header: this link carries a
  // credential, and a spoofed Host would hand a family's seat to whoever asked.
  const origin = getOrigin(request);
  const token = await createSeatOfferToken(participationId, new Date(sentAt));
  const link = (answer: "accept" | "decline") =>
    `${origin}${ROUTES.seatOffer}?token=${encodeURIComponent(token)}&answer=${answer}`;

  const params = {
    participantName,
    // The same test the confirmation page and the signup mail make on the row:
    // participant equals customer means the payer took the seat themselves, and
    // every sentence naming them moves into the second person.
    isSelfSeat: participantId === customerId,
    productName,
    deadline: formatDeadline(sentAt, locale, product.timezone),
    acceptUrl: link("accept"),
    declineUrl: link("decline"),
  };

  const t = await getEmailTranslator(locale);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: customer.email,
    subject: seatOfferSubject(t, params),
    htmlContent: buildSeatOfferEmail(t, locale, params),
    // Product mail TO a person: a family replying to this has a question about
    // their seat, so the reply goes to the monitored support inbox rather than
    // the unattended sending address.
    replyToEmail: SUPPORT_EMAIL,
  });
}

async function sendStaff({
  client,
  request,
  customerId,
  participantId,
  productId,
  reason,
  sentAt,
}: SeatOfferStaffEmailInput): Promise<void> {
  const { product, customer, participant } = await readContext(client, {
    customerId,
    participantId,
    productId,
  });

  // Staff mail is written in the default locale, like every mail we send to
  // ourselves: the recipient is the support inbox, and a mail that changed
  // language with the family's own setting is a mail nobody could search.
  const locale = DEFAULT_LOCALE;
  const productName =
    resolveTranslation(product.product_translations, locale)?.name;
  const participantName = participant?.first_name.trim();
  if (!productName || !participantName) {
    console.error("[seat-offer staff email] nothing to name — skipping the send", {
      productId,
      participantId,
    });
    return;
  }

  const contactName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim()
    : "";

  const params = {
    reason,
    participantName,
    contactName: contactName || participantName,
    contactEmail: customer?.email ?? "",
    productName,
    productSchedule: formatWeeklySchedule(
      product.schedule_slots,
      product.timezone,
    ),
    offeredAt: formatDate(sentAt, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
      timeZone: product.timezone,
    }),
    adminProductUrl: `${getOrigin(request)}${ROUTES.admin.product(product.product_type, productId)}`,
  };

  const t = await getEmailTranslator(locale);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    // The owner's decision for this flow: the support inbox rather than every
    // admin individually, so the freed seat and any conversation about it are
    // in one place.
    toEmail: SUPPORT_EMAIL,
    subject: seatOfferStaffSubject(t, params),
    htmlContent: buildSeatOfferStaffEmail(t, locale, params),
    // Mail we send to OURSELVES about a person: replying is how a staff member
    // answers them, so Reply-To is the family's address rather than support.
    // Falls back to support when the seat is an adult's own with no address on
    // file, because a reply-to that goes nowhere is worse than one that goes to
    // the desk already reading this.
    replyToEmail: customer?.email || SUPPORT_EMAIL,
  });
}

/**
 * The deadline, absolutely: a weekday, a date and a clock face with the zone
 * named.
 *
 * **Never "in five days".** A mail is read whenever it is read, and a relative
 * window is a sentence that stops being true the moment it is sent. The zone is
 * the PRODUCT's, and it is named — a mail is rendered without the reader's own
 * zone, so the only honest thing to do is state which zone the time is in.
 *
 * Explicit components rather than `dateStyle`/`timeStyle`, because `Intl`
 * refuses to combine either of those with `timeZoneName`.
 *
 * **`hour12: false` is pinned rather than left to the locale**, because `en`
 * would otherwise set this deadline as "02:20 PM" while the two in-app cards
 * that state the same instant set it as "14:20". One offer, read in an inbox
 * and again in My SOG, has to carry one clock face — a family comparing the two
 * should see the same digits rather than have to convert. The other four
 * locales already resolve to a 24-hour clock, so this changes only `en`.
 */
function formatDeadline(
  sentAt: string,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return formatDate(new Date(new Date(sentAt).getTime() + SEAT_OFFER_WINDOW_MS), locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
    timeZone,
  });
}

/**
 * The weekly slots as one line an admin can recognise a run by — "Tue 16:00,
 * Thu 16:00 (Europe/Helsinki)" — or null when the product has no schedule.
 *
 * English weekday names from the shared constant rather than translated copy:
 * this string appears only in the staff mail, which is written in one language
 * on purpose. The zone is the product's own, which is how the admin schedule is
 * read everywhere else too.
 */
function formatWeeklySchedule(
  slots: Array<{ weekday: number; start_time: string }>,
  timeZone: string,
): string | null {
  if (slots.length === 0) return null;
  const line = [...slots]
    .sort((a, b) =>
      a.weekday === b.weekday
        ? a.start_time.localeCompare(b.start_time)
        : a.weekday - b.weekday,
    )
    .map(
      (slot) =>
        `${DAYS_OF_WEEK[slot.weekday]?.slice(0, 3) ?? "?"} ${slot.start_time.slice(0, 5)}`,
    )
    .join(", ");
  return `${line} (${timeZone})`;
}

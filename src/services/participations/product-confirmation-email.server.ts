import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants/brand";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedCurrency } from "@/lib/constants/currency";
import {
  detectLocaleFromHeader,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  buildProductConfirmationEmail,
  productConfirmationAttachments,
  productConfirmationSubject,
  productConfirmationText,
  resolveProductConfirmation,
  type ProductConfirmationMode,
} from "@/lib/email-templates/product-confirmation";
import {
  invitationPlanWindow,
  type InvitationSlot,
} from "@/lib/email-templates/product-confirmation-invitation";
import {
  getEmailTranslator,
  getTopicPrepTranslator,
} from "@/lib/email-templates/translator";
import {
  resolveFamilyRecipients,
  type FamilyRecipient,
} from "@/lib/email/family-recipients.server";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { plannedSessionRows, type PlannedSession } from "@/lib/planned-sessions";
import { formatProductLocation } from "@/lib/products/format-product-location";
import {
  holidayBreakLines,
  holidayBreaksSpan,
  productToday,
} from "@/lib/products/holiday-breaks-shown";
import { HolidayBreaksService } from "@/services/holiday-breaks/holiday-breaks.service";
import { formatFirstChargeDate } from "@/lib/stripe/first-charge-anchor";
import { getOrigin } from "@/lib/url";
import { formatCurrencyFromCents } from "@/lib/money";
import type { AppSupabaseClient } from "@/types";

/**
 * The mail that follows a signup, sent from all three places a signup can land:
 * the free/instant activation in the checkout route, the waitlist join, and the
 * Stripe webhook that confirms a payment.
 *
 * **The parent is always a recipient — the person who paid, or would
 * have.** A child's seat produces a mail to their parent; a parent's own seat
 * produces a mail to themselves, and the only difference is the voice the copy
 * speaks in. That is why `isSelfSeat` is derived here from
 * `participantId === customerId` rather than being passed in: it is the same
 * test the confirmation page makes on the participation row, and deriving it
 * once stops the page and the mail from ever disagreeing about whose signup
 * this was.
 *
 * **A child with a mailbox of their own gets a copy beside the parent's** —
 * decided by the shared family-recipient resolver, never here. The copy is the
 * same template in its child variant: second person, no price row and no
 * billing bullets (paying is the parent's), the button at the child's own My
 * SOG root, and the same `invite.ics`, addressed to the child as its attendee.
 * Each recipient is rendered in their own locale, which is why everything below
 * that a locale touches is resolved inside the loop rather than once.
 *
 * **It takes ids and reads everything itself, including the recipient's own
 * address and locale.** Two of the three call sites are holding that profile
 * already, so passing it would save a read — and would put the choice of *whose*
 * profile at three call sites instead of one, on the one value that decides who
 * receives the mail. The read is a primary-key lookup, it is the same query that
 * resolves the participant's name, and it runs on a path that is about to wait
 * on Brevo anyway.
 *
 * **Every send site reads through the client it already has.** The checkout
 * route and the webhook hand over the admin client they were using; the waitlist
 * route hands over the caller's own, whose RLS already lets a parent read their
 * own row and their child's (it is the same read the confirmation page makes).
 * Nothing here constructs a privileged client of its own.
 */
/**
 * How a caller names the outcome — the five the mail branches on, plus one
 * sentinel it resolves for itself.
 *
 * **`honoured-offer` exists because the seat-offer answer does not know the
 * price shape and should not have to guess.** A seat is only ever *offered* on
 * a no-charge product, so the answer is `external` where the municipality is
 * invoiced and `free` everywhere else — and the product row this module already
 * reads carries the billing mode that decides it. The sentinel is resolved
 * before any params are built, so the template never meets it.
 *
 * A product flipped from no-charge to paid while the family was deciding still
 * honours the free seat; that grandfathering is deliberate and is stated in
 * `docs/architecture/products.md`'s waitlist section, so reading `paid` here as
 * `free` is the accepted answer rather than a gap.
 */
export type ProductConfirmationSendMode = ProductConfirmationMode | "honoured-offer";

export interface ProductConfirmationEmailInput {
  client: AppSupabaseClient;
  /**
   * The request the signup arrived on. Two things are read from it, and it is
   * passed whole rather than pre-resolved so neither can be got wrong at a call
   * site: the TRUSTED origin (`getOrigin`, never the raw Host — the links go in
   * an email), and `Accept-Language` as the locale fallback. The Stripe webhook
   * passes Stripe's own request, which is correct: its Host is either our
   * deployment's or untrusted, and both resolve to the canonical site URL.
   */
  request: Request;
  /** The payer, and always the recipient. */
  customerId: string;
  participantId: string;
  productId: string;
  /**
   * The seat itself. It is what the calendar entry is identified by — one entry
   * per participation, so two children in one club are two events a parent can
   * tell apart — and what the enrollment link in the mail points at.
   */
  participationId: string;
  mode: ProductConfirmationSendMode;
  /**
   * Currency to price the mail in. Read only on the modes that state an amount;
   * the free and waitlist modes have no price and never consult it.
   */
  currency?: SupportedCurrency;
  /**
   * When the first subscription invoice falls, as a true instant (ISO) — for a
   * club bought before it starts, where the parent completed Checkout at €0 and
   * is owed the real date in the same breath. The confirmation page states the
   * same line from the same rule.
   *
   * **Only the Stripe webhook passes one, because only the Stripe webhook knows
   * it without asking.** It has just retrieved the subscription to write the
   * `family_subscriptions` row, so the period end is in its hand; every other
   * send site would have to make a Stripe read or wait for a row it has not
   * written yet, and a billing line is never worth a round trip on a path that
   * must not fail. Absent, the mail simply states no first-charge bullet —
   * which is what a signup billed at checkout wants anyway.
   */
  firstChargeAt?: string | null;
}

/**
 * Send it, or don't — but never throw.
 *
 * **A failed send must not fail the signup.** The participation is the outcome
 * the family asked for and it is already committed by the time this runs; a
 * Brevo outage, a missing translation row or a read that RLS refuses are all
 * reasons to have no mail, and none of them is a reason to unwind a purchase or
 * answer a paid webhook with a 500 that Stripe will retry forever. So every
 * failure is logged and swallowed here, at the one place all three call sites
 * share, rather than each of them remembering a try/catch.
 */
export async function sendProductConfirmationEmail(
  input: ProductConfirmationEmailInput,
): Promise<void> {
  try {
    await send(input);
  } catch (error) {
    console.error("[product-confirmation email] send failed", {
      productId: input.productId,
      participantId: input.participantId,
      mode: input.mode,
      error,
    });
  }
}

/** Everything that can fail. The caller swallows the outcome on purpose. */
async function send({
  client,
  request,
  customerId,
  participantId,
  productId,
  participationId,
  mode: sendMode,
  currency,
  firstChargeAt = null,
}: ProductConfirmationEmailInput): Promise<void> {
  // A waitlist join composes no calendar object — a place in a queue is not a
  // seat — so nothing built from `site_details` reaches its mail.
  //
  // **That is what makes the one read below sound on every path**, and it is a
  // fact about the CLIENT rather than an optimisation: this is the one call
  // site that hands over the caller's own session, and `site_details` grants
  // SELECT to `authenticated` with policies for admins and gedus only, so on a
  // waitlist join that embed comes back silently empty. The rest of the read is
  // anon-readable — the schedule rows and a location's own names are what the
  // public browse grid paints — so the mail's "Good to know" facts arrive on
  // every mode. Every enrolled mode
  // arrives on the admin client (the checkout route, the Stripe webhook and the
  // seat-offer answer all pass one), which is what makes the site's address and
  // note readable exactly where a calendar entry is about to state them.
  const wantsSchedule = sendMode !== "waitlist";

  // Unrelated reads, so they run together — the people know nothing about the
  // product, and a signup confirmation is already behind the thing it confirms.
  // The payer and the participant come back in ONE query rather than two,
  // because on a self seat they are the same row.
  const [productResult, peopleResult, scheduleResult] = await Promise.all([
    client
      .from("products")
      .select(
        // The last five are the "Good to know" facts the mail states, read
        // through the same formatters the product page's card uses.
        // `topic` is the "Before the first session" guide's one input beyond
        // `delivery_mode`: which guide the mail carries, if any. It states no row
        // of its own and is not one of the "Good to know" facts.
        "product_type, billing_mode, topic, timezone, start_date, end_date, delivery_mode, min_age, max_age, for_gamers, for_parents, spoken_language_code, product_translations(locale, name, short_description)",
      )
      .eq("id", productId)
      .single(),
    client
      .from("profiles")
      // The sign-in mode decides whether the child gets a copy of their own;
      // `gamer_profiles` is one-to-one off `profiles`, so the embed is an
      // object or null (null for the payer).
      .select("id, first_name, last_name, email, locale, gamer_profiles(sign_in)")
      .in("id", [customerId, participantId]),
    client
      .from("products")
      .select(
        // `notes` here is the FAMILY-facing site note — how to find the room,
        // where to park. The staff-only note lives in `site_staff_details` and
        // is never read on this path.
        //
        // `parent:parent_id(...)` is the column-name form on purpose: the
        // `locations!parent_id` spelling resolves to a location's *children*
        // and answers `[]` for every leaf, which is how "Foo, undefined"
        // reaches a page.
        "schedule_slots(weekday, start_time, duration_minutes), locations(name, name_i18n, parent:parent_id(name, name_i18n), site_details(address, notes))",
      )
      .eq("id", productId)
      .single(),
  ]);

  if (productResult.error) throw productResult.error;
  if (peopleResult.error) throw peopleResult.error;
  if (scheduleResult.error) throw scheduleResult.error;

  const people = peopleResult.data;
  const customer = people.find((row) => row.id === customerId);
  const participant = people.find((row) => row.id === participantId);

  // Nowhere to write to. Not an error: a customer profile with no address is a
  // state the database permits, and there is nothing to report to anyone.
  if (!customer?.email) return;

  const product = productResult.data;
  // One clock for the whole send rather than one per render. Which occurrence a
  // calendar entry starts at is a function of when the mail was composed, and a
  // parent and a child comparing their two invitations are entitled to find the
  // same one.
  const now = new Date();

  // The planned sessions the invitation states, over the span the composer
  // walks its rule across. A second round trip rather than a fourth read beside
  // the others, because the span is the product's own — its zone decides which
  // day today is, and its end date where the span stops. A waitlist join
  // carries no invitation, so it asks for no plan.
  //
  // The club's holiday breaks ride the same second round trip, beside it: their
  // span is the product's own too — from today to the end of the term, or a
  // year ahead of an open-ended club's today — and every mode states them. A
  // failed read costs the list, not the mail: it is a row of the facts list.
  const breaksSpan = holidayBreaksSpan(product, now);
  const [plannedSessions, holidayBreakRows] = await Promise.all([
    wantsSchedule
      ? readPlannedSessions(client, productId, invitationPlanWindow({
          now,
          timezone: product.timezone,
          endDate: product.end_date,
        }))
      : [],
    breaksSpan === null
      ? []
      : new HolidayBreaksService(client)
          .getHolidayBreaks(productId, breaksSpan.from, breaksSpan.to)
          .catch((error: unknown) => {
            // The message alone: this handler is what keeps the mail going, so
            // it must not be able to throw itself, and inspecting an arbitrary
            // error object can.
            console.error("[product-confirmation email] holiday breaks unread", {
              productId,
              message: error instanceof Error ? error.message : String(error),
            });
            return [];
          }),
  ]);
  const breaksToday = productToday(product.timezone, now);
  // The sentinel resolved before anything is built, so the mail only ever meets
  // a real mode. A seat offer is made on no-charge products alone, so the only
  // question left is who bears the cost.
  const mode: ProductConfirmationMode =
    sendMode === "honoured-offer"
      ? product.billing_mode === "external_contract"
        ? "external"
        : "free"
      : sendMode;

  // An account erased since the seat was written takes the seat with it (ON
  // DELETE CASCADE), leaving no one to name. The first name itself needs no
  // check: the profiles CHECK stores it trimmed and at least two characters
  // long.
  if (!participant) {
    console.error(
      "[product-confirmation email] nothing to name — skipping the send",
      { productId, participantId },
    );
    return;
  }
  const participantName = participant.first_name;

  // The same test the confirmation page makes on the row: participant equals
  // customer means the payer took the seat themselves, and every sentence
  // naming them moves into the second person.
  const isSelfSeat = participantId === customerId;

  // Stored preference → what the browser asked for → English, per recipient —
  // the same chain every other send in the app walks, applied to the parent and
  // to the child separately, because they need not share a locale.
  const recipients = resolveFamilyRecipients({
    parents: [
      { email: customer.email, firstName: customer.first_name, locale: customer.locale },
    ],
    gamer: isSelfSeat
      ? null
      : {
          email: participant.email,
          firstName: participantName,
          locale: participant.locale,
          signIn: participant.gamer_profiles?.sign_in ?? null,
        },
    fallbackLocale: detectLocaleFromHeader(request.headers.get("Accept-Language")),
  });

  // The TRUSTED origin, never the raw Host header — these links go in an email,
  // and a spoofed Host would send a family somewhere we do not own.
  const origin = getOrigin(request);
  const site = scheduleResult.data.locations;
  const slots = scheduleResult.data.schedule_slots;

  for (const recipient of recipients) {
    const locale = recipient.locale;
    const translation = resolveRequiredTranslation(product.product_translations, locale);
    const productName = translation.name;
    const shortDescription = translation.short_description;

    const gamerCopy = recipient.kind === "gamer";
    // One link, read twice: the mail's button and the calendar entry's own URL.
    // The reader's own My SOG root — a `/parent` link bounces a signed-in child
    // — and My SOG rather than the seat's page, which needs a group the seat
    // usually does not have yet; see the composer's note on `dashboardUrl`.
    const dashboardUrl = `${origin}${gamerCopy ? ROUTES.gamer.dashboard : ROUTES.customer.dashboard}`;
    const t = await getEmailTranslator(locale);
    // The guide's own translator, in this reader's locale beside the first one:
    // it lives in the top-level `topicPrep` namespace, which a translator
    // scoped to `email` cannot reach. Both read the same catalog, so the two
    // cannot disagree about the locale.
    const tPrep = await getTopicPrepTranslator(locale);

    const content = resolveProductConfirmation(t, tPrep, locale, {
      participantName,
      isSelfSeat,
      productName,
      productType: product.product_type,
      // What the "Before the first session" guide is resolved from. Both copies
      // carry it — one text, written to read the same to a parent and to a
      // gamer — and a waitlist join carries none, which the resolver decides
      // from the mode rather than this call site.
      topic: product.topic,
      deliveryMode: product.delivery_mode,
      mode,
      // The child's copy states no price, so it never reads one.
      priceAmount: gamerCopy
        ? null
        : await resolvePriceAmount(client, { productId, mode, currency, locale }),
      // Only a deferred subscription has one, and only the Stripe webhook knows
      // it — see the input's own note. Rendered through the same rule the
      // signup panel states it with, in the product's zone, because a mail
      // has no viewer zone to project a clamped instant into. The child's copy
      // states no billing bullet at all, so it composes none.
      firstChargeDate:
        firstChargeAt && mode === "subscription" && !gamerCopy
          ? formatFirstChargeDate(
              firstChargeAt,
              product.start_date,
              product.timezone,
              locale,
              product.timezone,
            )
          : null,
      dashboardUrl,
      gamerCopy,
      // The "Good to know" facts the product page states, from the same columns
      // and through the same formatters. The location goes through the shared
      // rule rather than being re-derived here, so "Where" says what every
      // page says. Both copies
      // carry it, each resolved in its own reader's locale.
      overview: {
        timezone: product.timezone,
        startDate: product.start_date,
        endDate: product.end_date,
        slots,
        deliveryMode: product.delivery_mode,
        location: formatProductLocation(
          {
            delivery_mode: product.delivery_mode,
            product_type: product.product_type,
            locations: site,
          },
          locale,
        ),
        minAge: product.min_age,
        maxAge: product.max_age,
        forGamers: product.for_gamers,
        forParents: product.for_parents,
        spokenLanguageCode: product.spoken_language_code,
        now,
      },
      // The product page's list, by the same rule, in this reader's
      // locale: the same breaks, the same names, the same compact ranges.
      holidayBreaks: holidayBreakLines(holidayBreakRows, {
        today: breaksToday,
        locale,
      }),
      invitation: !wantsSchedule
        ? null
        : {
            participationId,
            participantName,
            isSelfSeat,
            gamerCopy,
            productName,
            productType: product.product_type,
            shortDescription,
            timezone: product.timezone,
            endDate: product.end_date,
            plannedSessions,
            slots: slots.map(
              (slot): InvitationSlot => ({
                weekday: slot.weekday,
                // `time without time zone` comes back as `HH:MM:SS`.
                startTime: slot.start_time.slice(0, 5),
                durationMinutes: slot.duration_minutes,
              }),
            ),
            deliveryMode: product.delivery_mode,
            // The shared `name_i18n[locale] ?? name` resolution every other
            // surface makes on a location row.
            siteName: site ? localizedLocationName(site, locale) : null,
            siteAddress: site?.site_details?.address ?? null,
            siteNote: site?.site_details?.notes ?? null,
            // This copy's own reader, so a client can offer them the RSVP: the
            // parent on the parent's, the child on theirs. The identifier is
            // the seat's, so both name the same calendar object.
            attendeeName: attendeeNameFor(recipient, { customer, participant }),
            attendeeEmail: recipient.email,
            dashboardUrl,
            now,
          },
    });

    const attachments = productConfirmationAttachments(content);

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: recipient.email,
      subject: productConfirmationSubject(t, content),
      htmlContent: buildProductConfirmationEmail(t, locale, content),
      // The mail's own words as text — stated only when a calendar part travels
      // with it, because that is what an Exchange mailbox fills the calendar
      // entry's notes from. With only HTML to work from it flattens the markup
      // into them instead.
      textContent: productConfirmationText(t, content),
      attachments: attachments.length > 0 ? attachments : undefined,
      // Product mail to a person: someone replying to this has a question about
      // their signup, so the reply goes to the monitored support inbox rather than
      // the unattended sending address.
      replyToEmail: SUPPORT_EMAIL,
    });
  }
}

/** One profile row, as much of a name as it holds. */
interface NamedRow {
  first_name: string;
  last_name: string | null;
}

/**
 * The attendee's display name for one recipient's copy.
 *
 * The full name where the row holds one, because that is what a calendar client
 * prints beside the RSVP. A child's surname is the family's and sits on their
 * own row like everyone else's.
 */
function attendeeNameFor(
  recipient: FamilyRecipient,
  { customer, participant }: { customer: NamedRow; participant: NamedRow },
): string {
  const row = recipient.kind === "gamer" ? participant : customer;
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.first_name;
}

/**
 * The product's planned sessions over one span, as the database plans them.
 * A failed read fails the send like every other read here: an invitation
 * composed without its plan would state a schedule nobody planned.
 */
async function readPlannedSessions(
  client: AppSupabaseClient,
  productId: string,
  { from, to }: { from: string; to: string },
): Promise<PlannedSession[]> {
  const { data, error } = await client.rpc("planned_session_dates", {
    p_product_id: productId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return plannedSessionRows.parse(data);
}

/**
 * The catalogue price for this signup, formatted in the reader's locale — or
 * null, which the builder renders as no price line at all.
 *
 * The price is read from the catalogue rather than from the amount that
 * actually moved, and the difference matters on exactly one case: a club bought
 * before it starts completes Checkout at €0 and bills the real amount later, so
 * the money that changed hands today is not the price the parent is agreeing
 * to. The catalogue row is what the product page quoted them and what the
 * subscription will charge.
 *
 * A missing row means the product is not sold in this currency, which is a
 * state a completed signup should not be in — but stating nothing is the right
 * answer either way, because a blank figure beside a product name reads as
 * "free".
 */
async function resolvePriceAmount(
  client: AppSupabaseClient,
  {
    productId,
    mode,
    currency,
    locale,
  }: {
    productId: string;
    mode: ProductConfirmationMode;
    currency: SupportedCurrency | undefined;
    locale: SupportedLocale;
  },
): Promise<string | null> {
  if (mode !== "subscription" && mode !== "upfront") return null;
  if (!currency) return null;

  const { data, error } = await client
    .from("product_prices")
    .select("price_cents")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return formatCurrencyFromCents(data.price_cents, currency, locale);
}

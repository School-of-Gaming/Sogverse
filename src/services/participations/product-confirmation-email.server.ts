import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedCurrency } from "@/lib/constants/currency";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
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
import type { InvitationSlot } from "@/lib/email-templates/product-confirmation-invitation";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { getOrigin } from "@/lib/url";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { AppSupabaseClient } from "@/types";

/**
 * The mail that follows a signup, sent from all three places a signup can land:
 * the free/instant activation in the checkout route, the waitlist join, and the
 * Stripe webhook that confirms a payment.
 *
 * **The recipient is always the customer — the person who paid, or would
 * have.** A child's seat produces a mail to their parent; a parent's own seat
 * produces a mail to themselves, and the only difference is the voice the copy
 * speaks in. That is why `isSelfSeat` is derived here from
 * `participantId === customerId` rather than being passed in: it is the same
 * test the confirmation page makes on the participation row, and deriving it
 * once stops the page and the mail from ever disagreeing about whose signup
 * this was.
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
}: ProductConfirmationEmailInput): Promise<void> {
  // A waitlist join reads no schedule at all, and that is a rule about the
  // CLIENT rather than an optimisation: this is the one call site that hands
  // over the caller's own session, and `site_details` grants SELECT to
  // `authenticated` with policies for admins and gedus only — a customer's
  // client matches neither, so the embed would come back silently empty and the
  // mail would state a site with no address. A place in a queue is not a seat
  // either, so there is nothing for a calendar to hold. Every enrolled mode
  // arrives on the admin client (the checkout route, the Stripe webhook and the
  // seat-offer answer all pass one), which is what makes the read below sound.
  const wantsSchedule = sendMode !== "waitlist";

  // Unrelated reads, so they run together — the people know nothing about the
  // product, and a signup confirmation is already behind the thing it confirms.
  // The payer and the participant come back in ONE query rather than two,
  // because on a self seat they are the same row.
  const [productResult, peopleResult, scheduleResult] = await Promise.all([
    client
      .from("products")
      .select(
        "product_type, billing_mode, topic, timezone, start_date, end_date, is_remote, product_translations(locale, name, short_description)",
      )
      .eq("id", productId)
      // Embedded resources come back unordered, so a product without a
      // translation in the reader's locale or in English would otherwise resolve
      // its name from an arbitrary row. Alphabetical locale order is arbitrary
      // too, but it is *stable*, which is all the fallback chain's last step
      // needs.
      .order("locale", { referencedTable: "product_translations" })
      .single(),
    client
      .from("profiles")
      .select("id, first_name, last_name, email, locale")
      .in("id", [customerId, participantId]),
    wantsSchedule
      ? client
          .from("products")
          .select(
            // `notes` here is the FAMILY-facing site note — how to find the
            // room, where to park. The staff-only note lives in
            // `site_staff_details` and is never read on this path.
            "schedule_slots(weekday, start_time, duration_minutes), locations(name, name_i18n, site_details(address, notes))",
          )
          .eq("id", productId)
          .single()
      : null,
  ]);

  if (productResult.error) throw productResult.error;
  if (peopleResult.error) throw peopleResult.error;
  if (scheduleResult?.error) throw scheduleResult.error;

  const people = peopleResult.data;
  const customer = people.find((row) => row.id === customerId);
  const participant = people.find((row) => row.id === participantId);

  // Nowhere to write to. Not an error: a customer profile with no address is a
  // state the database permits, and there is nothing to report to anyone.
  if (!customer?.email) return;

  // Stored preference → what the browser asked for → English. Same chain every
  // other send in the app walks.
  const locale: SupportedLocale = isSupportedLocale(customer.locale)
    ? customer.locale
    : detectLocaleFromHeader(request.headers.get("Accept-Language"));

  const product = productResult.data;
  // The sentinel resolved before anything is built, so the mail only ever meets
  // a real mode. A seat offer is made on no-charge products alone, so the only
  // question left is who bears the cost.
  const mode: ProductConfirmationMode =
    sendMode === "honoured-offer"
      ? product.billing_mode === "external_contract"
        ? "external"
        : "free"
      : sendMode;

  const translation = resolveTranslation(product.product_translations, locale);
  const productName = translation?.name;
  // Read here rather than beside the invitation below, because the guard on
  // `productName` narrows the row it comes from and the optional access would
  // then read as dead code.
  const shortDescription = translation?.short_description ?? null;
  const participantName = participant?.first_name.trim();

  // Both are guaranteed by the schema — a product has at least one translation
  // row, and `profiles.first_name` is NOT NULL — so this is a shape the data
  // model says cannot arrive. If it does, a mail whose subject line names an
  // empty product or an empty person is worse than no mail, so stop and say so.
  if (!productName || !participantName) {
    console.error(
      "[product-confirmation email] nothing to name — skipping the send",
      { productId, participantId, hasProductName: Boolean(productName) },
    );
    return;
  }

  // The TRUSTED origin, never the raw Host header — these links go in an email,
  // and a spoofed Host would send a family somewhere we do not own.
  const origin = getOrigin(request);
  // One link, read twice: the mail's button and the calendar entry's own URL.
  // My SOG rather than the seat's page, which needs a group the seat usually
  // does not have yet — see the composer's note on `dashboardUrl`.
  const dashboardUrl = `${origin}${ROUTES.customer.dashboard}`;
  const site = scheduleResult?.data.locations ?? null;
  const isSelfSeat = participantId === customerId;
  const t = await getEmailTranslator(locale);
  const priceAmount = await resolvePriceAmount(client, {
    productId,
    mode,
    currency,
    locale,
  });

  const content = resolveProductConfirmation(t, locale, {
    participantName,
    // The same test the confirmation page makes on the row: participant equals
    // customer means the payer took the seat themselves, and every sentence
    // naming them moves into the second person.
    isSelfSeat,
    productName,
    productType: product.product_type,
    mode,
    priceAmount,
    dashboardUrl,
    invitation:
      scheduleResult === null
        ? null
        : {
            participationId,
            participantName,
            isSelfSeat,
            productName,
            productType: product.product_type,
            productTopic: product.topic,
            shortDescription,
            timezone: product.timezone,
            startDate: product.start_date,
            endDate: product.end_date,
            slots: scheduleResult.data.schedule_slots.map(
              (slot): InvitationSlot => ({
                weekday: slot.weekday,
                // `time without time zone` comes back as `HH:MM:SS`.
                startTime: slot.start_time.slice(0, 5),
                durationMinutes: slot.duration_minutes,
              }),
            ),
            isRemote: product.is_remote,
            // The shared `name_i18n[locale] ?? name` resolution every other
            // surface makes on a location row.
            siteName: site ? localizedLocationName(site, locale) : null,
            siteAddress: site?.site_details?.address ?? null,
            siteNote: site?.site_details?.notes ?? null,
            attendeeName:
              [customer.first_name, customer.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() || customer.first_name,
            attendeeEmail: customer.email,
            dashboardUrl,
            now: new Date(),
          },
  });

  const attachments = productConfirmationAttachments(content);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: customer.email,
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

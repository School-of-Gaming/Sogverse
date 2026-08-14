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
  productConfirmationSubject,
  type ProductConfirmationMode,
} from "@/lib/email-templates/product-confirmation";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
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
  mode: ProductConfirmationMode;
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
  mode,
  currency,
}: ProductConfirmationEmailInput): Promise<void> {
  // Two unrelated reads, so they run together — the people know nothing about
  // the product, and a signup confirmation is already behind the thing it
  // confirms. The payer and the participant come back in ONE query rather than
  // two, because on a self seat they are the same row.
  const [productResult, peopleResult] = await Promise.all([
    client
      .from("products")
      .select("product_type, product_translations(locale, name)")
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
      .select("id, first_name, email, locale")
      .in("id", [customerId, participantId]),
  ]);

  if (productResult.error) throw productResult.error;
  if (peopleResult.error) throw peopleResult.error;

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
  const productName = resolveTranslation(
    product.product_translations,
    locale,
  )?.name;
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

  const params = {
    participantName,
    // The same test the confirmation page makes on the row: participant equals
    // customer means the payer took the seat themselves, and every sentence
    // naming them moves into the second person.
    isSelfSeat: participantId === customerId,
    productName,
    productType: product.product_type,
    mode,
    priceAmount: await resolvePriceAmount(client, {
      productId,
      mode,
      currency,
      locale,
    }),
    // The TRUSTED origin, never the raw Host header — this link goes in an
    // email, and a spoofed Host would send a family somewhere we do not own.
    dashboardUrl: `${getOrigin(request)}${ROUTES.customer.dashboard}`,
  };

  const t = await getEmailTranslator(locale);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: customer.email,
    subject: productConfirmationSubject(t, params),
    htmlContent: buildProductConfirmationEmail(t, locale, params),
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

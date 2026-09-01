import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { consentRefusalError } from "@/services/participations/consent-refusal";
import type { SupportedCurrency } from "@/lib/constants/currency";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  stripeLocaleOrAuto,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  createCheckoutBody,
  createParticipationResponse,
  createParticipationRpcResult,
} from "@/services/participations/participations.contracts";
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";
import { ROUTES } from "@/lib/constants";
import {
  computeSinglePaymentAmount,
  ensureStripeProductForProduct,
  getOrCreateSubscriptionPrice,
} from "@/lib/stripe/participation-prices";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { firstChargeAnchor } from "@/lib/stripe/first-charge-anchor";
import { stripe } from "@/lib/stripe/client";
import { CHECKOUT_SESSION_LIFETIME_MINUTES } from "@/lib/constants/participations";
import { getOrigin } from "@/lib/url";

/**
 * POST /api/checkout/products/create
 *
 * Discriminated success bodies; the client switches on `status`.
 *
 *   redirect           — paid signup (single-payment OR subscription). Always
 *                        send the parent to Stripe Checkout — even with a saved
 *                        card — for the trust/safety moment. Each subscription
 *                        is its own Stripe sub (one per gamer x club), so there
 *                        is no inline add.
 *   free_confirmed     — any product billed free (event, club, camp); no
 *                        Stripe involvement. Keyed on billing_mode, never on
 *                        product_type.
 *   external_confirmed — municipality club; invoiced off-platform, no Stripe.
 *   full               — seat gone; UI flips to the waitlist CTA.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  // "sign up for products", not "sign gamers up": the seat may be the caller's
  // own on a for-parents product.
  forbiddenMessage: "Only customers can sign up for products",
  // The body used to be read as a bag of optional strings and checked field by
  // field. The schema states the same rules once, and `purchaseShape` and
  // `currency` arrive as the supported enums rather than as strings the handler
  // has to re-test.
  body: createCheckoutBody,
  response: createParticipationResponse,

  // `no_data_found`: the RPC raises it for a product that does not exist, which
  // is the same call the waitlist route makes and gets the same answer — the
  // parent named a product from a page they were browsing, so the shop surface
  // treats it as bad input beside the signup button rather than sending them to
  // a not-found page. Every other code the RPC raises (its check violations,
  // the already-enrolled unique violation) already lands where this route put
  // it by hand.
  errorStatus: { P0002: 400 },

  // The RPC's refusals are written for the parent to read — "registration has
  // not yet opened", "product is not accepting signups" — and the shop renders
  // them verbatim beside the signup button. The consent refusal is the one
  // exception and is swapped for a code below, before it can be disclosed.
  discloseErrorMessages:
    "create_participation's messages are the user-facing explanation of a refused signup, and the shop surface renders them as-is",

  handler: async ({ request, user, profile, body }) => {
    const { productId, participantId, purchaseShape } = body;
    const currency: SupportedCurrency = body.currency;

    const admin = createAdminClient();

    // This one read is the single source for everything Stripe is told about
    // the product: the Stripe Product's name, tax code and metadata, and the
    // purchase metadata written onto the payment intent, the invoice and the
    // subscription. Two reads could disagree; one cannot. It fails closed —
    // a read error answers 404 rather than letting a defaulted product type
    // pick the wrong tax code downstream.
    const { data: product, error: productErr } = await admin
      .from("products")
      .select(
        "id, product_type, billing_mode, seat_count, timezone, spoken_language_code, start_date, end_date, product_translations(locale, name)",
      )
      .eq("id", productId)
      // Embedded resources come back unordered, so a product without an English
      // translation resolved its name from an arbitrary row. Alphabetical
      // locale order is arbitrary too, but it is *stable*, which is all the
      // fallback chain's last step needs. Ordering an embedded resource needs
      // its table named — a bare `.order("locale")` would order `products` by a
      // column it does not have.
      .order("locale", { referencedTable: "product_translations" })
      .single();
    if (productErr) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const locale = resolveLocale(profile.locale);

    // The last resort of both name resolves below, named once so that "the two
    // chains end in the same string" is structural rather than a claim a reader
    // has to verify by comparing two literals ten lines apart. It reaches Stripe
    // — a receipt, the hosted portal, an internal Slack message — never
    // `messages/`, so no locale sweep will ever translate it, and the brand name
    // is the right shape for a string in that position.
    const fallbackProductName = "School of Gaming product";

    // The same field resolved twice, for two audiences that want different
    // answers. Both names come out of the one `product_translations` array
    // already read above — two resolves, no second query. The variables are
    // named for their locale rather than one being the bare `productName`,
    // because "the product's name" is now a question with two right answers and
    // a later reader must be made to pick.
    //
    // Prefer the parent's locale for the one customer-facing name we still
    // control on the Checkout page: the subscription description. Both line
    // items now name the shared Stripe Product, whose name is resolved at the
    // default locale and shared across every locale.
    const parentLocaleProductName =
      resolveTranslation(product.product_translations, locale)?.name ??
      fallbackProductName;
    // The default-locale name, for the session metadata a Stripe Workflow turns
    // into an internal Slack notification. Its audience is staff in one channel,
    // where one stable name per product is the whole point — resolving it in the
    // buyer's locale would file the same club under a different heading
    // depending on who happened to buy it. Same convention as the shared Stripe
    // Product's name above.
    const defaultLocaleProductName =
      resolveTranslation(product.product_translations, DEFAULT_LOCALE)?.name ??
      fallbackProductName;

    // Shape x billing_mode must agree. Each billing mode has exactly one valid
    // shape family: free→'free', external_contract→'external', paid→
    // subscription/single_payment. Mismatches are rejected up front so the RPC
    // only ever sees a coherent (shape, product) pair. These stay in the route
    // rather than in the body schema because they need the product row.
    if (purchaseShape === "free" && product.billing_mode !== "free") {
      return NextResponse.json(
        { error: "Only free products accept the 'free' purchase shape" },
        { status: 400 },
      );
    }
    if (
      purchaseShape === "external" &&
      product.billing_mode !== "external_contract"
    ) {
      return NextResponse.json(
        {
          error:
            "Only externally-contracted products accept the 'external' purchase shape",
        },
        { status: 400 },
      );
    }
    if (
      purchaseShape !== "free" &&
      purchaseShape !== "external" &&
      product.billing_mode !== "paid"
    ) {
      return NextResponse.json(
        { error: "Paid purchase shapes only apply to paid products" },
        { status: 400 },
      );
    }

    const isSubscription = purchaseShape.startsWith("subscription_");
    const isSinglePayment = purchaseShape === "single_payment";

    // The two type-keyed guards below are about *paid* shapes only, and the
    // ordering above is what keeps them that way: a free club's shape resolves
    // to `free`, which is neither of these, so both are unreachable on it. They
    // are correct as written and must not be re-keyed to billing_mode — a paid
    // club's seat requires a subscription, and only a club may be sold as one.
    if (isSinglePayment && product.product_type === "consumer_club") {
      return NextResponse.json(
        { error: "Consumer clubs use subscriptions, not single-payment" },
        { status: 400 },
      );
    }
    if (isSubscription && product.product_type !== "consumer_club") {
      return NextResponse.json(
        { error: "Only consumer clubs accept subscriptions" },
        { status: 400 },
      );
    }

    // For a paid shape this call only *validates* — it runs every signup rule
    // (parent-of, lifecycle, registration window, currency, already-enrolled,
    // seat cap) under the product gate lock and writes nothing. The row is
    // created from the Stripe webhook once payment lands, so a parent who
    // abandons Checkout leaves nothing behind and there is no seat to release.
    // The no-charge shapes (free, external) still activate here and now.
    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "create_participation",
      {
        p_product_id: productId,
        p_participant_id: participantId,
        p_customer_id: user.id,
        p_purchase_shape: purchaseShape,
        p_currency: currency,
        // The enrolment conditions the parent ticked. Passed straight through
        // and never checked here: `record_required_consents` inside the RPC is
        // what compares them against the product's requirement set, under the
        // same product-gate lock as every other signup rule, and it refuses
        // with a check violation naming what is missing. Doing it here as well
        // would put a second copy of the rule outside the lock, where it could
        // read a requirement set that changed a moment later.
        p_consented_documents: body.consentedDocuments,
      },
    );

    // Every refusal but one travels on to be disclosed verbatim. The consent
    // refusal is swapped for a generic message and a code the panel can act on
    // — see `consent-refusal.ts` for why this one is not the parent's to read.
    if (rpcErr) throw consentRefusalError(rpcErr) ?? rpcErr;

    const rpcParsed = createParticipationRpcResult.safeParse(rpcResult);
    if (!rpcParsed.success) {
      console.error(
        "create_participation returned an unexpected shape:",
        rpcParsed.error.message,
      );
      throw new ApiError("Failed to start checkout", 500);
    }
    const rpcJson = rpcParsed.data;

    if (rpcJson.kind === "full") {
      return { status: "full" as const };
    }

    if (rpcJson.kind === "free_active" || rpcJson.kind === "external_active") {
      if (!rpcJson.participation_id) {
        throw new ApiError(
          `create_participation returned ${rpcJson.kind} with no participation id`,
          500,
        );
      }
      // The seat is live and nothing else in this request can fail it, so the
      // confirmation mail goes out here — but AFTER the response, not inside
      // it. The outcome the parent is waiting on is already committed, and the
      // send is two or three reads plus a Brevo round trip; holding the
      // response open for it makes the click slower and buys nothing, because
      // the mail's success cannot change the answer. `after()` keeps the
      // function alive for the send once the response has gone out — the same
      // committed-outcome/follow-up-send shape the Discord webhook uses. Safe
      // to fire and forget: the helper swallows its own failures and cannot
      // throw, so a Brevo outage never surfaces as an unhandled rejection.
      //
      // **The two no-charge outcomes send different mails.** They used to send
      // the same one — a municipality registration is invoiced off-platform, so
      // from our till it is the free case exactly — and that reasoning stopped
      // at our till. Most municipalities carry the whole cost, but some ask
      // families for a small fee of their own, which the municipality has
      // already told them about; our "Free" then contradicts something the
      // reader knows, and a confirmation mail is a bad place to be corrected by
      // your own council. `external` names who bears the cost and stops there:
      // what the municipality then asks of a family is not ours to state, and
      // how we settle up with the municipality is not theirs to read.
      after(
        sendProductConfirmationEmail({
          client: admin,
          request,
          customerId: user.id,
          participantId,
          productId,
          mode: rpcJson.kind === "external_active" ? "external" : "free",
        }),
      );

      // Municipality clubs are invoiced off-platform, so like the free flow the
      // participation is already active and we never touch Stripe. Both land on
      // the same confirmation page.
      return rpcJson.kind === "free_active"
        ? {
            status: "free_confirmed" as const,
            participationId: rpcJson.participation_id,
          }
        : {
            status: "external_confirmed" as const,
            participationId: rpcJson.participation_id,
          };
    }

    // kind === 'validated' — the signup is acceptable and nothing was written.
    // Nothing below this line needs unwinding on failure: an escape from the
    // block leaves the database exactly as it was, so the try/catch exists only
    // to keep raw Stripe/PostgREST text away from a parent (this route
    // discloses its error messages) and to answer with a deliberate status.
    try {
      const stripeCustomerId = await getOrCreateStripeCustomer(admin, user.id);

      // Every paid signup — single-payment AND subscription — goes through Stripe
      // Checkout. Each consumer-club subscription is its own Stripe subscription
      // (one per gamer x club), created fresh below in `mode: "subscription"`.
      // There is no inline subscription update: a parent with a card on file
      // still sees Checkout (the trust moment), and one sub per club means each
      // is independently cancelable from the Stripe portal.

      const origin = getOrigin(request);
      // Success lands on the confirmation page keyed by the Checkout Session,
      // not by a participation — there is no participation yet, and the session
      // id is the only handle both ends share. `{CHECKOUT_SESSION_ID}` is
      // Stripe's literal placeholder, substituted at redirect time; it must
      // reach Stripe unencoded. The page resolves it back to the row the webhook
      // wrote (Stripe waits up to 10s on our endpoint before redirecting, so it
      // is almost always there) and shows a finalizing state if it is not.
      const successUrl = `${origin}${ROUTES.shopPaidConfirmation("{CHECKOUT_SESSION_ID}")}`;
      // Cancel bounces straight back to the product page so the parent can
      // retry. Nothing to undo — no row was written.
      const cancelUrl = `${origin}${ROUTES.shopProduct(productId)}`;

      // The three links the Slack notification offers its reader: the product's
      // admin page, the paying customer's admin page, and the public shop page.
      // Finished URLs, assembled here, because a Stripe Workflow can substitute
      // a variable into a message but cannot map an enum onto a URL shape. A
      // Workflow building `/admin/{productType}/{productId}` would be a second,
      // hand-maintained copy of the type→path mapping, living in the Dashboard
      // outside this repo where no compiler sees it and a new product type
      // produces a 404 nobody is warned about. `ROUTES.admin.product` is an
      // exhaustive `switch` with no `default`, so it is the one place that
      // mapping can be wrong *and be caught* — keeping it the only place is the
      // entire reason these are built here instead of over there.
      //
      // Absolute, because a Slack message has no origin to resolve against, and
      // off the `origin` above — `getOrigin(request)`, never the raw `Host` —
      // which matters more here than for the redirects: staff click these, in
      // the channel they trust most, so a spoofed `Host` would turn our own
      // purchase alert into a phishing link aimed at our own team.
      //
      // Accepted trade: each URL freezes at purchase time. Restructuring an
      // admin route later leaves this code correct while the links in Slack
      // messages already sent go stale — acceptable because those messages are
      // read within minutes of the purchase and never revisited, but the next
      // person moving an admin route should meet that deliberately here rather
      // than discover it from a dead link.
      const adminProductUrl = `${origin}${ROUTES.admin.product(product.product_type, productId)}`;
      const adminUserUrl = `${origin}${ROUTES.admin.user(user.id)}`;
      // Textually identical to `cancelUrl` above, and deliberately duplicated
      // rather than shared. `cancelUrl` is where an abandoned checkout bounces
      // the parent back to; this is where a Slack reader goes to see what was
      // bought. Two independent reasons that happen to name the same page today,
      // so folding them into one variable would silently drag one along the next
      // time the other has to move.
      const shopProductUrl = `${origin}${ROUTES.shopProduct(productId)}`;

      // The metadata IS the link between this session and the participation the
      // webhook will create. Nothing else carries it, so every field here is
      // load-bearing rather than informational. The webhook and the
      // confirmation page read `participantId` back by exactly this name.
      //
      // `productName`, `productType` and the three `*Url` keys are read by a
      // Stripe Workflow, not by us: it posts a Slack notification naming the
      // product and linking to it. The type no longer picks a link — the
      // finished URLs above do — but it stays, because it can gate which
      // purchases trigger a notification at all. It ships as the raw Postgres
      // enum (`camp`, `consumer_club`, `municipality_club`, `event`), so a
      // template wanting prose has to map it rather than interpolate it.
      // camelCase, matching the object they join.
      const sessionMetadata = {
        customerId: user.id,
        participantId,
        productId,
        productName: defaultLocaleProductName,
        productType: product.product_type,
        adminProductUrl,
        adminUserUrl,
        shopProductUrl,
        purchaseShape,
        currency,
      };

      // What finance reads. Stripe metadata does not propagate between objects
      // — a session tells a charge, an invoice or a subscription nothing — so
      // the same snapshot is attached to each object a report actually reads:
      // the payment intent (a charge inherits its metadata), the invoice, and
      // the subscription. It is a snapshot of what was true when the money
      // moved, which is the copy an auditor should trust; the Stripe Product
      // carries the same facts as the *current* catalogue entry.
      //
      // snake_case, matching the Stripe Product metadata convention. The
      // session's own camelCase keys above are load-bearing — the webhook and
      // the confirmation page read them — so the two sets stay separate rather
      // than one being renamed into the other.
      //
      // `locale` (what the parent browses in) and `spoken_language_code` (what
      // the product is delivered in) are different facts: a Finnish-speaking
      // parent may buy an English-delivered camp.
      const purchaseMetadata: Record<string, string> = {
        product_id: productId,
        // participant_id, not gamer_id: this finance snapshot was born inside
        // the participant-rename window and has no history to preserve (unlike
        // the payments ledger echo, which keeps gamerId deliberately), so on a
        // self seat it names the payer's own id honestly. The finance report
        // reads this key and a backfill corrects existing test- and live-mode
        // objects — the two move together.
        participant_id: participantId,
        customer_id: user.id,
        locale,
        spoken_language_code: product.spoken_language_code,
      };
      // Delivery dates, for revenue recognition — a camp sold in April is
      // delivered in August and Stripe cannot otherwise know. Bare `date`
      // columns, already `YYYY-MM-DD`; they travel verbatim, never re-anchored
      // to a viewer's zone. A null date omits its key entirely.
      if (product.start_date) {
        purchaseMetadata.delivery_start = product.start_date;
      }
      if (product.end_date) purchaseMetadata.delivery_end = product.end_date;

      // This no longer pins a reservation lifetime — nothing is held, and the
      // expiry event isn't even handled. It bounds a *stale tab*: the Session
      // freezes the amount at creation, so leaving it payable for Stripe's
      // 24h default means a forgotten tab can pay yesterday's price and create
      // a participation long after the parent last looked at the product.
      const expiresAt =
        Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_MINUTES * 60;

      // Adaptive Pricing presents each customer their local currency and lets
      // Stripe convert, while the Session/PaymentIntent still report our EUR
      // integration currency and settle us in EUR at the price we set.
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: stripeCustomerId,
        adaptive_pricing: { enabled: true },
        // Render Stripe's own chrome ("Subscribe", "Pay", field labels) in the
        // parent's app locale. Falls back to 'auto' (browser Accept-Language) for
        // locales Stripe doesn't support — e.g. Klingon.
        locale: stripeLocaleOrAuto(profile.locale),
        // Show the "Add promotion code" field. Codes themselves are created and
        // managed in the Stripe dashboard (per mode — test and live separately);
        // nothing in our DB models them. With Adaptive Pricing, percent-off
        // coupons convert cleanly; amount_off coupons are currency-bound, so
        // prefer percent-off when creating codes.
        allow_promotion_codes: true,
        // Enable Stripe Tax so new signups get VAT itemized like the migrated
        // subs do. `customer_update: { address: "auto" }` is required by Stripe
        // whenever a `customer` is pre-set on the session with automatic_tax on;
        // it also makes Checkout collect the billing address and persist it back
        // onto the Customer, which Stripe Tax needs to locate the customer.
        automatic_tax: { enabled: true },
        customer_update: { address: "auto" },
        expires_at: expiresAt,
        metadata: sessionMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [],
      };

      if (isSinglePayment) {
        const amount = await computeSinglePaymentAmount(
          admin,
          productId,
          currency,
        );
        if (amount === null) {
          throw new ApiError(`Product is not sold in ${currency}`, 400);
        }
        // Adds a Stripe product search to every one-off checkout, on the
        // customer-blocking path. Acceptable at this volume, and far below
        // Stripe's search rate limit.
        const stripeProductId = await ensureStripeProductForProduct(product);
        sessionParams.mode = "payment";
        sessionParams.line_items = [
          {
            quantity: 1,
            // The real Stripe Product, not an inline product name. It carries
            // the tax code that decides the VAT rate — camps are reduced-rated
            // and were being charged the account-wide standard rate — and it
            // keeps the Stripe product list a usable index of what we sell.
            // The price stays inline because the amount varies by currency and
            // discount. Accepted cost: the line-item name on the Checkout page
            // is the default-locale one, exactly as consumer clubs already are.
            price_data: {
              currency,
              unit_amount: amount,
              product: stripeProductId,
              // Our prices are the full amount the customer pays, VAT inside.
              // Unstated this resolves to the account default (inclusive
              // today); stated, it survives that default changing.
              tax_behavior: "inclusive",
            },
          },
        ];
        sessionParams.payment_intent_data = { metadata: purchaseMetadata };
        // A one-off session creates no invoice by default, which left an admin
        // able to issue only a raw refund — and a Stripe Refund carries no tax
        // and no discount fields at all, so refunded VAT was never reversed
        // anywhere. An invoice is what makes a credit note possible, and a
        // credit note is what reverses both.
        //
        // Stripe creates it asynchronously, so the session's invoice reference
        // may still be null when `checkout.session.completed` arrives and the
        // local payment row's invoice id stays null. Accepted: Stripe is the
        // finance source of record here, not our tables.
        sessionParams.invoice_creation = {
          enabled: true,
          invoice_data: { metadata: purchaseMetadata },
        };
        // Offer to save the card for future purchases. Checked = saved with
        // `allow_redisplay: always`, so it's offered/prefilled on the customer's
        // next Checkout and manageable from the billing portal. Subscriptions
        // (the other branch) already save the card by necessity.
        sessionParams.saved_payment_method_options = {
          payment_method_save: "enabled",
        };
      } else {
        const priceRow = await getOrCreateSubscriptionPrice(
          admin,
          product,
          currency,
        );
        if (!priceRow) {
          throw new ApiError(`Product is not sold in ${currency}`, 400);
        }
        sessionParams.mode = "subscription";
        sessionParams.line_items = [
          { quantity: 1, price: priceRow.stripe_price_id },
        ];
        // Describe the sub as "{Club} — {Participant}". A family has one Stripe
        // sub per participant x club, all listed together in the hosted portal;
        // without a per-sub description they'd be indistinguishable there (and
        // two kids in the same club would show as two identical rows). This is
        // the label the parent reads when deciding which one to cancel — and
        // since a parent can now hold a seat themselves, the participant may be
        // the payer.
        sessionParams.subscription_data = {
          // The session's keys and the subscription's are two objects, not one
          // shared reference: the session keeps exactly the camelCase set the
          // webhook reads, and the subscription carries that set *plus* the
          // finance snapshot, because nothing propagates from the session to it.
          metadata: { ...sessionMetadata, ...purchaseMetadata },
          description: `${parentLocaleProductName} — ${await pickParticipantName(
            admin,
            participantId,
            participantId === user.id,
          )}`,
        };

        // A club that has not started yet defers its first charge to its start
        // date: the anchor is product-local midnight on `start_date`, clamped to
        // what Stripe accepts, and prorations are off so the parent pays €0 at
        // checkout rather than a part-month. The subscription is `active`
        // immediately either way — the seat is held and sessions show — and no
        // trial vocabulary appears anywhere on Stripe's page. A product with no
        // start date, or one starting now or in the past, gets neither parameter
        // and behaves exactly as it did before.
        //
        // **The anchor is stamped once, here, and never revisited.** An admin who
        // later moves the product's start date does NOT move the first-charge
        // date of subscriptions that already exist — that correction is manual in
        // the Stripe dashboard for now (the sync is a recorded TODO.md
        // follow-up). The admin start-date field carries a hint saying so; this
        // comment is the other end of the same gap, at the site where the anchor
        // is born.
        const anchor = firstChargeAnchor(
          product.start_date,
          product.timezone,
          new Date(),
        );
        if (anchor !== null) {
          sessionParams.subscription_data.billing_cycle_anchor = Math.floor(
            anchor.getTime() / 1000,
          );
          sessionParams.subscription_data.proration_behavior = "none";
        }
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      if (!session.url) {
        throw new ApiError("Stripe did not return a Checkout URL", 502);
      }

      return { status: "redirect" as const, checkoutUrl: session.url };
    } catch (error) {
      // Deliberate status and message. This route discloses error text to the
      // parent, so a raw PostgREST or Stripe string must not reach them — and a
      // driver's error code would otherwise be mapped to a misleading status.
      if (error instanceof ApiError) throw error;
      console.error("[checkout/products] checkout failed:", error);
      throw new ApiError("Could not start checkout", 500);
    }
  },
});

/**
 * A short display name for whoever occupies the seat, for the Stripe
 * subscription description (what the parent reads in the billing portal).
 *
 * The fallback is deliberately audience-aware. It lands in Stripe receipts and
 * the hosted portal — outside `messages/`, so no locale sweep will ever reach
 * it — and "Parents' Evening — your child" would be a plainly wrong label on a
 * seat the payer holds themselves. A self seat therefore falls back to "you",
 * which answers the same "who is this for" question the child names answer, in
 * the same register as the child fallback beside it.
 *
 * `isSelfSeat` is passed in rather than re-derived here: the caller holds the
 * session user, and the participant-equals-customer test is the same one the
 * database's audience gate makes.
 */
async function pickParticipantName(
  admin: ReturnType<typeof createAdminClient>,
  participantId: string,
  isSelfSeat: boolean,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", participantId)
    .maybeSingle();
  return data?.first_name || (isSelfSeat ? "you" : "your child");
}

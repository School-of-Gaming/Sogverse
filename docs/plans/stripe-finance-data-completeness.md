# Stripe finance data completeness

Make every Sogverse purchase self-describing in Stripe, so finance can build a VAT report from
Stripe alone, and so camps stop being billed at the wrong VAT rate.

## Problem

Sogverse tells Stripe almost nothing about what was sold. Three failures follow.

**1. Camps are billed at the wrong VAT rate.** The paid-signup checkout builds its
single-payment line item as an inline price with an inline product *name* and no tax code, so
Stripe Tax falls back to the account-wide default tax code and charges Finland's **standard
25.5%**. Camps must be sold at Finland's **reduced 13.5%**. Prices are VAT-inclusive, so the
difference comes out of margin, not off the customer's bill.

Camps sold before the Sogverse checkout existed were separate Stripe products carrying an
explicit tax code, which is why they were correctly reduced-rated. Nothing carries that forward.

**2. A refund reverses money but not VAT.** One-off checkouts create no invoice, so an admin
refunding in the Stripe dashboard can only issue a raw refund. A Stripe `Refund` object has no
tax and no discount fields at all, and a credit note — which does carry tax amounts — requires
an invoice to exist. Refunded VAT is therefore never reversed anywhere.

**3. The finance feed is missing everything.** Stripe metadata does not propagate between
objects. The checkout session carries the product, gamer and customer ids, but the objects a
finance report reads carry nothing — a camp payment intent's metadata is literally `{}`. There
is no way to tell from a charge which product was bought, what language it is delivered in, or
when it is delivered.

## Scale

Real 2026 figures from the live Stripe account:

- **177 camp sales in 2026**, €30,601.88 gross. At the wrong rate a season costs roughly
  **€2,578 of margin** (~€6,218 VAT at 25.5% versus ~€3,640 at 13.5%).
- Already live: **5 camp sales in July 2026** billed at 25.5%, ~€68 over-remitted. Small only
  because the season had ended.
- **63 of 180 one-off sales carried a discount** — discounts are routine, not an edge case.
- **€1,575.45 was refunded across 2026** with no VAT reversal recorded anywhere.
- **39 camp sales** in the CFO's workbook carried the wrong VAT, because the data had to be
  inferred from prices rather than read.

Paid events travel the same code path as camps but are a rounding error by volume: the only
non-camp one-off sales in Stripe across all of 2026 were three "Sogverse Starter Pack" purchases.

## The decision

### VAT treatment is derived in code — nothing is persisted

**There is no migration in this plan and no new column.** VAT treatment is a pure function of
`product_type`, evaluated wherever it is needed:

| product_type | treatment | Stripe tax code | Finland rate today |
|---|---|---|---|
| `camp` | reduced | `txcd_35010001` | 13.5% |
| `consumer_club`, `event` | standard | `txcd_10000000` | 25.5% |
| `municipality_club` | standard | `txcd_10000000` | never reaches Stripe |

**Why `txcd_35010001`.** The company's CFO ruled that camps qualify for Finland's reduced rate
and that this is the correct Stripe category for them; every camp the business sold before
Sogverse existed was tagged with it. It is recorded here as a finance ruling, not as an
inference from precedent — the label ("Books for Children") reads oddly against an
instructor-led children's camp, and the plan does not defend it beyond the ruling. If that
ruling is ever revisited, this table is the one place to change.

**Paid events are standard-rated**, also by the owner's ruling. There is no historical evidence
either way for events, so this is a decision rather than a precedent.

`municipality_club` is in the table defensively. Those products are `external_contract`, invoiced
off-platform, and never reach Stripe — do not go looking for a surface that uses that row.

**No percentage is persisted anywhere**, because nothing is persisted at all: the treatment is
derived on demand. A percentage appears only in the mapping module, for display in the admin
form. Finland moved its reduced rate from 14% to 13.5% on 1 January 2026, and Stripe resolves the
real rate from the tax code and the sale date — so when Finland next moves a rate, only the
displayed number goes stale. The module should say so.

**Admins cannot edit this.** The admin product form *displays* the treatment, the percentage it
resolves to, and authored copy explaining why — read-only. Editability was considered and
rejected: unconstrained choice is how a wrong rate gets picked.

`product_type` has no UI or RPC path that can change it after creation (the update RPC takes no
product type, and the admin form receives it as a fixed prop), which is what makes a derived
treatment stable in practice. It is **not** a database guarantee — admins hold UPDATE on
`products` through PostgREST — but a later purchase re-derives it.

### Camps and events use a shared Stripe product, like clubs

Today only consumer clubs create a real Stripe product; camps and events do not. Generalise the
existing lazy create-on-first-purchase helper so every product that reaches Stripe gets one, with
its tax code set from the derived treatment. Free and external-contract products never reach
Stripe and are unaffected.

For one-off products the price stays inline — the amount varies by currency and discount — but
the inline price references the **existing product id** instead of an inline product name, and
sets `tax_behavior: "inclusive"` explicitly.

**Events gain everything except a rate change.** They are already charged 25.5% via the account
default, which is what they are supposed to pay. They get the explicit tax code, the invoice, the
metadata and the stable product — and they take the localization regression below without a rate
fix to show for it.

**Accepted regression, call it out in review:** the shared Stripe product is named at the default
locale, so the camp or event name on the Stripe Checkout page becomes English instead of the
parent's language. This is exactly the behaviour consumer clubs already have. Accepting it was a
deliberate trade: one mechanism with one known limitation, fixed once for everything, rather than
two mechanisms with two behaviours. The alternative — keeping an inline product and setting
`product_data.tax_code` on it, which does work — was rejected below.

There is an open `TODO.md` item, "Localize the subscription line-item name on the Stripe Checkout
page", whose scope line reads "Scope: subscriptions only" and explicitly says camps and events
escape the problem via the inline path. **This change makes that false.** Editing `TODO.md`
requires the owner's explicit approval — ask before touching it, and if approval is withheld, say
so in the PR description rather than shipping a TODO that misdescribes the code. Note the rewrite
is more than a scope swap: that item also cites `pickTranslationName` and `pickProductName`, and
**neither function exists** — the real one is `resolveTranslation`, whose chain is
`userLocale → en → first`, with no `fi` step despite what the item says.

**Idempotency without a schema change.** The helper finds an existing Stripe product by searching
`metadata.product_id`. Stripe's product search is eventually consistent (roughly a minute), so
two first purchases seconds apart can both miss and both create. Close that by passing a
**deterministic idempotency key derived from the Sogverse product id** on the create call —
Stripe returns the same product for a repeat within 24 hours, and after 24 hours the search is
long since consistent. The reconcile's update call needs no key; updates are naturally idempotent.

One residual, accepted: the create call's parameters include the product name, which is mutable.
If a rename lands and a *create* is attempted under the same key within 24 hours, Stripe answers
`idempotency_error` rather than deduping. In practice the search is consistent within about a
minute, so the create path is not reached — the exposure is a sub-minute window immediately after
a rename on a product that has never sold. Not worth designing around; worth knowing about when
reading an unexpected `idempotency_error`.

### When the reconcile actually fires

The current helper returns early when it finds an existing Stripe product and never reconciles,
so a Sogverse product that is later renamed or retimed keeps stale Stripe values forever. Add
that reconcile: compare the Stripe product's mutable fields (name, tax code, metadata) against the
Sogverse row and update in place when they differ. Stripe products are mutable, unlike price
amounts, so this is an update rather than a replacement.

**The two product shapes reconcile on different schedules, and this is deliberate:**

- **Camps and events** have no price cache, so the helper runs on **every purchase** — they
  reconcile every time.
- **Consumer clubs** resolve their Stripe price from a cache, and that lookup returns early when
  the cached amount still matches the catalogue price. The Stripe-product call sits below that
  early return, so for clubs the helper runs only on the **first sale** and on a **price change**.

Do **not** lift the product call above the price-cache early return. That would add a Stripe
product search — and sometimes an update — to every club checkout, on the customer-blocking path,
to keep cosmetic metadata fresh. The tax code, which is the only money-critical field, is set
correctly when the product is created and changes only if the ruling in this document changes,
which is a deliberate event handled by re-running the backfill (step 7).

So the honest statement of club behaviour: **a club's name, dates and spoken language can drift
from Stripe indefinitely, and the backfill script is the tool that fixes it.** Its tax code
cannot silently drift, because nothing changes it.

**Do not couple the reconcile to product creation or editing in Sogverse either.** Talking to
Stripe only where we already need to is deliberate. A Stripe *product* is the current catalogue
entry, not the historical record — the invoice and charge snapshot the tax actually applied at
the moment of sale and never change — so a stale product cannot make Stripe lie about a past sale.

### Metadata that finance actually needs

Existing **session** metadata keys are camelCase and load-bearing — the webhook and the shop
confirmation page read `session.metadata.gamerId` and `.productId`. **Do not rename them.** New
metadata uses snake_case, matching the existing Stripe product metadata convention.

| Object | Keys |
|---|---|
| Stripe **product** | `product_id` (already present), `spoken_language_code`, `delivery_start`, `delivery_end` |
| **Payment intent** (one-offs) | `product_id`, `gamer_id`, `customer_id`, `locale`, `spoken_language_code`, `delivery_start`, `delivery_end` |
| **Invoice** (one-offs) | same set as the payment intent |
| **Subscription** (clubs) | existing camelCase keys, plus the same new snake_case set |

The **checkout session's** own metadata is deliberately left exactly as it is. Note that the
route currently builds one `metadata` object and assigns it to both `sessionParams.metadata` and
`subscription_data.metadata`, and an integration test asserts that identity. Adding keys to the
subscription therefore means splitting those two objects apart — that is intended, and it breaks
the identity assertion; see step 9.

The delivery and language facts appear on **both** the product and the purchase deliberately. On
the product they describe the current catalogue entry; on the purchase they snapshot what was
true when the money moved. Given clubs reconcile rarely, the purchase copy is the one an auditor
should trust.

Two facts this table encodes, both verified against live data:

- **A charge inherits its payment intent's metadata.** Verified by comparing Chargebee-originated
  charges against their payment intents in the live account: identical keys on both
  (`customer_email`, `customer_id`, `order_id`). So `payment_intent_data.metadata` reaches the
  object a charge-based report reads.
- **An invoice does not.** Invoice metadata is set separately through the checkout session's
  invoice-creation invoice data.

`delivery_start` / `delivery_end` come from the product's start and end dates, for revenue
recognition — a camp sold in April is delivered in August and Stripe cannot otherwise know.
Nullability is per type: `end_date` is nullable only for `consumer_club` (a check constraint
forces it for camp, event and municipality club), and for `event` a second constraint pins
`start_date` equal to `end_date`, so events effectively have both. Omit a key entirely when its
date is null, and note the reconcile diff must therefore handle key *removal*, which Stripe
expresses as writing an empty string. These are bare `date` columns — write them UTC-pinned as
`YYYY-MM-DD`, never re-anchored to a viewer's zone.

The split between `spoken_language_code` and `locale` is deliberate: a Finnish-speaking parent
browsing in Finnish may buy an English-delivered camp. Different facts, names that cannot be
confused.

No `product_type` in Stripe metadata. It is internal behavioural and marketing taxonomy, and the
tax code already separates camps from everything else — which is what the VAT rule does, and it
groups by the thing finance reports on.

### One-off checkouts create invoices

Enable invoice creation on single-payment checkout sessions. This produces a real invoice with
line items, tax breakdown and discount lines, matching what subscriptions already produce, and it
is what makes a credit note possible.

**This is the refund fix and it is independent of the product change.** Creating a real Stripe
product does not create an invoice. Shipping only the product change leaves refunds broken.

Stripe creates the checkout invoice *asynchronously*, so the session's invoice reference may still
be null when `checkout.session.completed` arrives, leaving the local payment row's invoice id
null. **Accepted — do not add a webhook to backfill it.** Stripe is the finance source of record
and this plan's premise is that finance reads Stripe, not our tables.

### Refunds stay manual, with a documented process

No refund flow is built in Sogverse; refunds continue to be issued by admins in the Stripe
dashboard. Once invoices exist the dashboard offers a credit note, which reverses VAT and discount
correctly. Document for admins: **refund via credit note against the invoice, never a raw refund.**

### No discrepancy checker is built

An in-app checker comparing declared treatment against the rate Stripe charged was considered and
rejected as disproportionate — and unnecessary, because once the tax code is on the product the
rate is *computed from* it. "Rate disagrees with intent" stops being silently possible; only "a
new product never got a code" remains, and that is visible on the product in Stripe before it ever
sells. Instead, document in `docs/stripe.md` how finance audits this:

- In the monthly export, group by product and check the rate column — every camp 13.5%,
  everything else 25.5%. One row out of line is the whole check.
- On the Stripe product itself, the tax category is a visible field; a camp not carrying the
  reduced-rate code is the root cause, catchable before any sale.

This only holds if every product carries an explicit code, which is why step 7 matters more than
its size suggests.

## Rejected alternatives

- **Keeping the inline product and setting `product_data.tax_code` on it.** This works — see
  Verification for the exact call that proved it. Rejected anyway: the product would not exist
  until the first sale, so the pre-sale audit check above becomes impossible, and Stripe keys the
  auto-created product off the `product_data` payload, so a localized name mints a separate
  product per language and the products list stops being a usable index of what we sell. The
  localized checkout name is the price paid for a coherent product catalogue, and it is a
  limitation clubs already have.
- **Lifting the Stripe-product call above the subscription price cache** so clubs reconcile on
  every purchase. Rejected: adds a Stripe round trip to every club checkout on the
  customer-blocking path, to refresh cosmetic metadata. The money-critical field cannot drift.
- **A `vat_treatment` column admins can edit, with a justification field.** Rejected: the rule is
  fixed, so an editable field adds a migration, two RPC signature changes, contract and form
  changes, and four test-file updates to buy a way to get it wrong. It would also have leaked:
  `products` is granted `SELECT` to `anon`, so anyone holding the anon key can ask PostgREST for
  any column on that table directly — an admin's internal justification text would have been
  world-readable regardless of what our own callers select.
- **Storing the VAT percentage.** Rejected: Finland changed its reduced rate on 1 January 2026;
  any stored number would already be wrong.
- **`product_type` in Stripe metadata.** Rejected: internal taxonomy Stripe has no business
  knowing, and the tax code already provides the finance-relevant split.
- **A `stripe_product_id` column or cache table for idempotency.** Rejected: needs a migration,
  grants, RLS and a DB-test authorization-spine entry, and the cached id does not by itself fix
  the race — it is written *after* the create, so two concurrent first purchases both read null
  and both create. A deterministic idempotency key solves it with no schema.
- **Minting a human-readable SKU.** Rejected: Stripe assigns a product id and
  `metadata.product_id` links it back.
- **Reconciling the Stripe product when a Sogverse product is created or edited.** Rejected:
  couples Sogverse's admin flow to Stripe availability for no correctness gain, since the
  historical record is the invoice, not the product.
- **Building a refund flow in Sogverse.** Rejected for now: refunds are handled manually outside
  Sogverse and there is no appetite to bring them in.
- **An in-app VAT discrepancy checker.** Rejected: see above. It would also cry wolf, since UK
  customers legitimately pay 0%.
- **Changing the account-wide default tax code instead of setting codes per product.** Rejected:
  a default is invisible and applies to anything that forgets.

## Steps

1. **Tax mapping module**: `product_type` → treatment → Stripe tax code, plus the display
   percentage. **Do not mark it `server-only`** — it holds no secrets, and the backfill script
   (step 7) must import the same table rather than duplicating it. One place, so a future code or
   rate change is one edit. Comment that the percentage is display-only.
2. **Make translation resolution deterministic.** Embedded `product_translations(locale, name)`
   selects have no ordering, so a product with no English translation resolves its name from an
   arbitrary row. There are **three** such selects: the checkout route, the Stripe price helper,
   and the billing portal's server module. Fix the **two Stripe-facing ones** — the third feeds
   only a display name in the billing portal and carries the same latent nondeterminism, but
   fixing it is optional here and should not be mistaken for an oversight. Do **not** change the
   shared `resolveTranslation`, which is used across the whole app for every translated entity and
   whose `userLocale → en → first` chain is correct.

   Ordering an *embedded* resource needs the referenced table named explicitly —
   `.order("locale", { referencedTable: "product_translations" })`. There is no existing use of
   `referencedTable` anywhere in `src/`, so there is no in-repo precedent to copy; a bare
   `.order("locale")` orders `products` by a column it does not have and fails loudly.
   Alphabetical locale order is arbitrary but deterministic, and deterministic is the whole
   requirement.

   This is a **latent bug in clubs today**; it becomes load-bearing here because a flapping name
   makes the reconcile update on every purchase and makes two concurrent creates differ under one
   idempotency key.
3. **Generalise the Stripe product helper**: create for every product type that reaches Stripe,
   set the tax code from the mapping, write the product metadata, pass a deterministic idempotency
   key derived from the Sogverse product id, and reconcile name/tax code/metadata when it finds an
   existing product. The helper is currently private and selects only `id` and translations — it
   must be exported and its select widened to include `product_type`, `spoken_language_code`,
   `start_date` and `end_date`. Delete its JSDoc about avoiding a migration by searching metadata;
   it argues against what the code now does.

   **Fail closed on a product-row read error.** The helper currently discards the select error and
   falls back to a generic name — harmless when the only casualty is a display string. Once the
   tax code is derived from `product_type` on that same read, the same silent degradation would
   create a camp's Stripe product carrying the *standard* rate code, which is precisely the bug
   this plan exists to fix, made permanent on a real product. A failed or empty read must raise,
   not default. (Whether the helper re-reads at all, or takes the row the checkout route already
   loaded, is the implementer's call — the fail-closed requirement is not.)
4. **One-off checkout**: point the inline price at the real Stripe product instead of an inline
   product name, set `tax_behavior: "inclusive"`, attach purchase metadata to the payment intent,
   enable invoice creation, and set invoice metadata. Note this adds a Stripe product search to
   every one-off checkout, on the customer-blocking path — acceptable at this volume, and Stripe's
   search rate limit is far above it.

   **Where the new metadata values come from:** the route's own product select today is
   `id, product_type, billing_mode, seat_count, timezone` plus translations — it carries none of
   `spoken_language_code`, `start_date` or `end_date`. Either widen that select or have the helper
   return the values it already had to read. Pick one and use it for both the one-off and
   subscription branches, so there is a single source for the purchase metadata rather than two
   that can disagree.
5. **Subscription checkout**: split `sessionParams.metadata` and `subscription_data.metadata` into
   separate objects, leaving the session's camelCase keys untouched and adding the new snake_case
   keys to the subscription only.
6. **Admin product form**: read-only display of the VAT treatment, its percentage, and authored
   copy. **Show it only for `billing_mode === "paid"`** — a free club or a municipality club never
   produces a Stripe sale, and showing "25.5%" there would read as a claim about an invoice we do
   not issue. Billing is the natural home, and that section already has both the product type and
   the effective billing mode in scope, so no prop threading is needed. The panel earns no
   style-guide demo and no preview scene under the two-reasons test — it is neither reused nor a
   design in flux. Format the percentage through `next-intl`'s number
   formatter with `style: "percent"` **and `maximumFractionDigits: 1`** — the default is zero
   fraction digits, which renders 13.5% as "14 %" and 25.5% as "26 %". There is no global
   `formats` config in `src/i18n/`, so set it at the call site or add one centrally. Every string
   must be a message key (`i18next/no-literal-string` is an error), with the number interpolated
   rather than baked in. Author the English copy first and have the **owner or CFO** approve it
   before deriving the other locales — it is compliance-adjacent. Then follow the i18n gates in
   `src/i18n/CLAUDE.md`: edit catalogues with the round-tripping script rather than by hand, run
   the completeness check, and keep placeholder parity against `en.json` across all five locales
   including `tlh`, where a fun take is welcome but the rate itself must stay accurate.
7. **Backfill existing Stripe products**: a re-runnable one-shot under `scripts/`, following the
   existing script precedent — `npx tsx`, its own `.env.local` parsing, a header comment with the
   invocation, because `src/lib/stripe/client.ts` is `server-only` and binds its key at import.
   It imports the step 1 mapping module, which is why that module must not be `server-only`. Run
   separately against test and live. Identify products we own by the presence of
   `metadata.product_id`; that also excludes the throwaway per-checkout products Stripe minted for
   past camp sales, which are **left alone** — their sales are closed and their invoices already
   record the tax that was applied. Give it a report-only mode, since the audit procedure above
   depends on "every product carries an explicit code" and that claim needs checking, not
   assuming. The live key on a developer machine may be restricted and need product read and write
   access granted first.

   **It writes the same field set the reconcile does** — name, tax code and metadata — not tax
   codes alone. This is what makes it the answer to club drift: consumer clubs only revisit their
   Stripe product on first sale or a price change, so this script is the only thing that brings a
   renamed or retimed club back in line.
8. **Deploy order**: run the live backfill **before** the code deploy, so the club products that
   currently carry no tax code become explicit rather than self-healing one price-change at a time.
   This does nothing for camps — camps have no Stripe product to backfill; theirs are created by
   the new code at first purchase — so do not treat the backfill as protecting the camp path.
9. **Tests.** Affected suites:
   - the checkout integration test asserts the single-payment line item carries an inline
     `product_data` name — that assertion becomes false;
   - the same file asserts `subscription_data` equals `{ metadata: params.metadata, description }`
     — step 5 breaks that identity, and the assertion on the session metadata object itself needs
     checking too;
   - the participation-prices unit test mocks `stripe.products` with `search` and `create` only,
     so the reconcile's `update` call is undefined on the mock and its tests throw;
   - nothing covers `invoice.paid` arriving with no subscription, which becomes a live path — every
     existing fixture supplies a subscription id.
   There is **no shared Stripe mock factory** in `tests/mocks/` today (only postgrest, server-only
   and supabase); the checkout test, the webhook test and the participation-prices test each roll
   their own. Creating one is in scope; migrating all three onto it is the implementer's call.
   No new API route is added, so the route posture registry needs no new entry — the checkout
   route is already registered. No migration, so no DB authorization-spine entry either.
10. **Docs**: `docs/stripe.md` gains the refund runbook, the finance audit procedure, and a note
    that one-off sessions now create invoices — the canonical webhook event list is **unchanged**,
    say so explicitly so nobody adds credit-note or invoice events speculatively.
    `docs/products-architecture.md` gains VAT treatment as a product fact. These go in `docs/`
    rather than a colocated file because the rule spans the checkout route, the Stripe helpers and
    the admin form, and `src/lib/stripe/` has no `CLAUDE.md` (`src/services/billing/CLAUDE.md`
    exists but owns the billing portal, not checkout). If the implementer finds the reconcile
    invariant wants to live next to the code, a colocated file is a reasonable call.

## Verification

**The VAT acceptance criteria cannot be verified in Stripe test mode.** Test mode is configured
differently from live: it carries an **EU One-Stop-Shop registration that live does not have**,
and a different account default tax code. A cross-border test there produces destination rates
live would never charge. Verify the Finland-domestic case in test mode with a Finnish billing
address and read the rate off the session's tax breakdown; treat any cross-border result there as
meaningless.

**What this does and does not mean.** Test mode carries the *same* Finnish standard registration
as live, so a Finnish customer resolves through the same registration in both. The headline
acceptance criterion — a camp at 13.5%, a club or event at 25.5% — is therefore **fully verifiable
in test mode before merge**: run a real checkout through the changed code with a Finnish billing
address and read the rate off the completed session's tax breakdown. No live purchase is needed to
sign this off.

What test mode cannot tell you is anything about a **non-Finnish** customer, because its extra
One-Stop-Shop registration makes it apply destination rates that live would never charge. Ignore
cross-border results there entirely.

Credit-note mechanics — that a credit note carries tax amounts and reverses the discount — are
also confirmable in test mode, since that is about the shape of the object rather than the rate.

**After deploy**, confirm on the *first real camp sale* that it billed at 13.5%. This is a check
on traffic that was going to happen anyway, not a staged purchase to arrange — and it is the
answer to "did this work in production", which is the one thing test mode genuinely cannot
answer.

**The rates in the mapping table have been read off Stripe, not assumed.** A
`POST /v1/tax/calculations` in test mode — free, and test mode carries the same Finnish standard
registration as live — for 10000 minor units, `tax_behavior=inclusive`, a Helsinki billing
address, returns:

- `txcd_35010001` → tax 1189 on 10000 inclusive, i.e. **13.5%**, `taxability_reason:
  reduced_rated`
- `txcd_10000000` → **25.5%**, `taxability_reason: standard_rated`

Reproduce that before trusting the admin form's displayed percentage. It matters because
Finland's bands moved twice around 1 January 2026 (the 10% band rose to 14%, the 14% band fell to
13.5%), so which band Stripe places a code in is an empirical fact rather than a deduction. If a
future run disagrees, the mapping table is the single place to change, and the change is a finance
decision, not an implementation one — take it to the owner rather than adjusting the table to
match whatever Stripe happens to return.

**How the Stripe composability claims were checked** (reproduce before relying on them; both were
run against test mode with the Stripe CLI):

- A `POST /v1/checkout/sessions` in `mode=payment` carrying `automatic_tax`, `adaptive_pricing`,
  `invoice_creation` with `invoice_data[metadata]`, and `payment_intent_data[metadata]`
  simultaneously was accepted, and the created session echoed all of them.
- The same call with `line_items[0][price_data][product_data][tax_code]=txcd_35010001` was
  accepted, and retrieving the session's line items with the product expanded showed the
  auto-created product carrying that tax code, `tax_behavior: inclusive`, and the localized name —
  which is what makes the rejected alternative genuinely viable rather than hypothetical.

**Webhook interaction, verified in code, confirm on staging:** `invoice.paid` is already a
subscribed event. Its handler returns early when the invoice has no subscription, before any read
or write, so one-off invoices produce no duplicate payment row.

## Acceptance criteria

- A camp bought through Sogverse is charged 13.5% VAT; a club or paid event is charged 25.5%.
- A camp purchase produces a Stripe invoice showing the line item, tax breakdown and any discount.
- The same camp bought twice references the same Stripe product. The concurrent-first-purchase
  case is not reproducible by hand; the verifiable proxy is that the create call carries a
  deterministic key derived from the Sogverse product id.
- Renaming a camp or event, or changing its dates or spoken language, is reflected on its Stripe
  product at the next purchase, and a purchase that changes nothing issues no Stripe update.
  **For consumer clubs this is explicitly not promised** — their Stripe product is only revisited
  on first sale or a price change, and the backfill script is how they are brought back in line.
- A charge carries enough metadata to identify the product, its delivery language, its delivery
  dates, the gamer, the customer and the buyer's locale, without consulting the checkout session
  or the Stripe product. The same is true of a one-off invoice.
- An admin creating a **paid** product sees the VAT treatment and the rate it resolves to, and
  cannot change it. Both current rates render their decimal — "13,5 %" and "25,5 %" in Finnish,
  never "14 %" or "26 %". (`maximumFractionDigits: 1` is a maximum, so a future whole-number rate
  would correctly render without a decimal; the criterion is "never rounds away a real decimal",
  not "always shows one".) A free or municipality product shows no VAT panel.
- Refunding via credit note reverses both VAT and discount.
- The backfill's report mode shows no product carrying `metadata.product_id` without a tax code.

## Constraints discovered while deciding

- **Stripe metadata does not propagate between objects**, with one verified exception: a charge
  carries its payment intent's metadata. Sessions do not feed invoices, charges or subscriptions.
- **Stripe prices are immutable** in amount and tax behaviour — a change means a new price, and
  the superseded price must not be deactivated because live subscriptions still bill against it.
  **Stripe products are mutable** in name, tax code and metadata.
- **An unspecified `tax_behavior` resolves to the account default**, which on this account is
  inclusive. Setting it explicitly on the rewritten one-off price is belt-and-braces against that
  default changing — **it is not fixing a live overcharge**; today's camp prices are correctly
  treated as VAT-inclusive.
- **Stripe product search is eventually consistent** (roughly a minute) and cannot be relied on
  for idempotency under concurrent purchases. A reused idempotency key whose request parameters
  differ is rejected outright rather than deduped.
- **A `Refund` object carries no tax and no discount fields.** Only a credit note does, and a
  credit note requires an invoice.
- **Inline prices accept an existing product id** in place of an inline product name, and also
  accept a `tax_code` on an inline product — both verified, see Verification.
- **The live account has exactly one tax registration**: Finland, standard, no One-Stop-Shop. EU
  customers outside Finland are charged Finnish VAT; UK customers are charged nothing. Do not
  assume destination rates apply, and do not treat a 0% UK sale as a defect.
- **Finland's reduced rate is 13.5%**, lowered from 14% on 1 January 2026.
- **`Intl.NumberFormat` with `style: "percent"` defaults to zero fraction digits**, so both VAT
  rates render wrong without an explicit `maximumFractionDigits`.
- **The Stripe product name is resolved at the default locale** with an en-then-first fallback,
  and that fallback is only deterministic once step 2 lands.

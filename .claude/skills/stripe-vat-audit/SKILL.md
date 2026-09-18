---
name: stripe-vat-audit
description: Run the monthly Stripe VAT audit, check a product's tax category before it goes on sale, or run the Stripe product backfill script — after club catalogue data has changed, before a deploy that depends on it, or when checkout fails on an archived Stripe product.
---

# The monthly VAT audit and the Stripe product backfill

How VAT treatment is derived, and why no percentage is stored, is
`docs/architecture/products.md` §Billing. This skill is the finance-side check that the
derivation reached Stripe, and the script that repairs it when it has not.

## The monthly VAT audit

Every sale now goes through a Stripe product we own, and each of those carries an explicit tax category, so the rate Stripe charged is *computed from* a field finance can see rather than declared beside it. (Sales predating that change went through throwaway products Stripe auto-created per checkout, which is why a camp could be billed at the standard rate — audit periods before the deploy knowing that.) What remains is small:

- **Monthly, export the period's sales and group by product.** Check the rate column: every camp at Finland's reduced rate (13.5% today), everything else at the standard rate (25.5% today). One row out of line is the whole check — there is nothing else to reconcile.
- **A 0% row is not a defect.** The live account holds exactly one tax registration: Finland, standard, no One-Stop-Shop. UK customers are therefore charged nothing, and EU customers outside Finland are charged Finnish VAT rather than a destination rate. A UK sale at 0% is correct, and treating it as an error is the commonest way to misread this export.
- **Before a product goes on sale, read its tax category off the Stripe product.** It is a visible field there, so a camp not carrying the reduced-rate category is catchable at the catalogue rather than a month later in the export — which is the only failure this check still has to look for. Expect the reduced-rate category's Stripe label to read oddly against a children's camp: the CFO's ruling names the category, not its label, and the mapping module under `src/lib/stripe/` is where that ruling is recorded.

**There is deliberately no in-app discrepancy checker**, and building one is not a follow-up. "The rate disagrees with what we intended" stopped being possible once the tax category sits on the product; the only remaining failure is "a new product never got a category", which the pre-sale check above catches, and a checker would additionally cry wolf on every legitimate 0% UK sale.

## The Stripe product backfill script

`scripts/` carries the Stripe product backfill: a re-runnable one-shot that walks the Stripe products we own — identified by a `product_id` key in their metadata — and writes the name, tax category and metadata the Sogverse catalogue says they should have. It has a report-only mode; run that to confirm no product carrying that metadata key is missing a tax category, which is the assumption the audit above rests on. Run it separately against test and live, and note the live key on a developer machine may be restricted and need product read and write access granted first.

Two things decide when it runs:

- **The first live run happens *before* the code deploy, not after.** Club products that carry no tax category become explicit in one pass, rather than self-healing one price change at a time. It does nothing for camps — a camp has no Stripe product to backfill, because its product is created by the checkout code at first purchase — so do not treat the backfill as protecting the camp path.
- **It is the standing answer to club drift.** A consumer club revisits its Stripe product only on its first sale and on a price change, so a club renamed, retimed or moved to another spoken language can carry stale values on Stripe indefinitely. Re-run the backfill whenever club catalogue data has moved. The tax category is the one field that cannot silently drift, because nothing changes it after creation.

Throwaway per-checkout products that Stripe minted for past camp sales carry no `product_id` metadata and are left alone: those sales are closed and their invoices already record the tax that was applied.

One more thing the report surfaces: **archiving a Stripe product in the dashboard breaks checkout for that product** — the checkout still finds and reuses the archived product, and the session creation then fails. The report marks every owned product active or inactive, and an `inactive` marker on something still on sale is that failure waiting to happen; unarchive it in the dashboard.

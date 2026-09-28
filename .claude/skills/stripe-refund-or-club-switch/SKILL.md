---
name: stripe-refund-or-club-switch
description: Refund a family, or move a child from one consumer club to another. A refund is a credit note against the invoice in the Stripe dashboard, never a raw refund; a club switch runs from the admin groups panel, never by editing the subscription in Stripe. Also explains the proration lines a switch leaves on the family's next invoice.
---

# Refunds and club switches

Both are admin actions against the live Stripe account, and both have one right path and
a tempting wrong one. The code-side rules behind them are `docs/architecture/products.md`
§Billing.

## Refund via a credit note against the invoice, never a raw refund

There is no refund flow in Sogverse and none is planned — an admin refunds in the Stripe dashboard. **Open the invoice for the purchase and issue a credit note against it.** Do not press refund on the charge or the payment intent.

A Stripe refund reverses money and describes nothing about it: the refund object carries no tax fields and no discount fields at all. So a raw refund leaves the VAT inside that money permanently over-remitted, and a promotion code that reduced the sale unaccounted for. That is the state 2026's refunds are in: roughly €1,575 reversed across the year with no VAT reversal recorded anywhere, and no invoice behind the one-off sales among them to credit after the fact. A credit note carries the tax breakdown and the discount lines, so it reverses both, and it is the object a VAT return can be built from. It needs an invoice to credit against, which is why one-off checkouts now create one.

Refunds are the one money movement not recorded in our own tables — Stripe is the system of record for them, and no in-app state may promise a refund.

## A club switch is done from the groups panel, never by editing the subscription

A family moving a child from one consumer club to another is one admin action on the product's groups panel: drag the seat's chip onto the Switch club zone in the panel's header, pick the new club and the group the gamer sits in there (or leave them unassigned), confirm. Do **not** change the subscription's price or product in the Stripe dashboard and repoint the seat separately — the two edits are in two systems with no lock between them, and the hand-done version reliably leaves the subscription naming a club the child no longer attends, at a price that is not that club's.

Two things follow for whoever reads the account afterwards. **A switch adds proration lines to the family's next invoice** — a credit for the unused time on the old club and a debit for the new one — so a club invoice carrying extra lines is expected rather than a defect; nothing is charged at the moment of the switch. And **the panel refuses a switch whose latest invoice is unpaid, or whose subscription bills in a currency the target club has no price in**; both are settled in Stripe first, and the second means an Adaptive Pricing subscription in a non-EUR currency cannot be switched by the tool at all.

The paid-invoice gate reads the **latest** invoice only, so an *earlier* invoice that went uncollectible passes it unnoticed — open the customer's invoice list in Stripe before switching a family with any history of payment trouble.

Refunds stay where they are: the switch never issues one, and a family owed money back is handled by the credit-note procedure above.

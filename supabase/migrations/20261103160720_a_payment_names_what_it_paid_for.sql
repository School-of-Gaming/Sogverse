-- A payment names what it paid for.
--
-- `payments` recorded the seat and the product a payment bought only inside its
-- untyped `metadata`, and a renewal not even there: it carried the Stripe
-- subscription id alone, so what it paid for had to be found through a
-- family_subscriptions row that ceased to exist whenever its seat was deleted.
-- A seat now ends instead of disappearing, so the link can be a real column.
--
-- 1. `payments` gains `participation_id` and `product_id`, and the webhook
--    writes both.
-- 2. Every existing row is backfilled from what it carries.
--
-- `metadata` stays as it is, historical keys included: it is the forensic echo
-- of the Stripe event, and the columns are what a reader queries.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

-- participation_id: SET NULL, because a held seat is deleted only by erasure
-- (trg_participations_guard_delete), and the payment is an accounting record
-- that outlives it. RESTRICT would make every erasure of a paid seat a fight
-- with the ledger; the money stays recorded against the payer and the product.
--
-- product_id: RESTRICT. A product with a held seat cannot be deleted anyway
-- (its seats cascade, and the delete guard refuses them), so this only ever
-- refuses deleting a product money was taken for — which is the point.
ALTER TABLE public.payments
  ADD COLUMN participation_id uuid
    REFERENCES public.participations(id) ON DELETE SET NULL,
  ADD COLUMN product_id uuid
    REFERENCES public.products(id) ON DELETE RESTRICT;

CREATE INDEX idx_payments_participation
  ON public.payments USING btree (participation_id)
  WHERE participation_id IS NOT NULL;

CREATE INDEX idx_payments_product
  ON public.payments USING btree (product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON COLUMN public.payments.participation_id IS 'The seat this payment paid for. Set on a checkout that bought a seat (single_payment, and the first subscription_invoice of a club) and on every club renewal (subscription_invoice, through its family_subscriptions row). NULL on reservation_duplicate, which bought no seat (the seat the family already held is metadata.existingParticipationId); on a checkout that completed after its seat had already ended; on a renewal recorded before seats were kept, whose seat had been deleted; and after the seat is erased (ON DELETE SET NULL: the payment is an accounting record and outlives it).';

COMMENT ON COLUMN public.payments.product_id IS 'The product this payment paid for: the seat''s product at the moment it was paid, which a club switch can later move the seat away from. Set on every checkout (single_payment, subscription_invoice, reservation_duplicate) and every renewal. NULL only on a row written before this column whose product could not be recovered — a renewal whose seat had been deleted, or a bundle row carrying no product. ON DELETE RESTRICT: a product money was taken for is not deleted.';

-- ---------------------------------------------------------------------------
-- 2. The backfill
-- ---------------------------------------------------------------------------

-- Checkout rows name their product in metadata, every purpose alike.
UPDATE public.payments pay
   SET product_id = prod.id
  FROM public.products prod
 WHERE pay.product_id IS NULL
   AND prod.id::text = pay.metadata->>'productId';

-- A checkout that bought a seat names it: `participationId` since the
-- participation became the seat, `reservationId` before that (the reservation
-- WAS the participation row). A duplicate's `reservationId` named the seat the
-- duplicate failed to take, not one it bought, so duplicates are left out. A
-- seat deleted before seats were kept matches no row and stays NULL.
UPDATE public.payments pay
   SET participation_id = part.id
  FROM public.participations part
 WHERE pay.participation_id IS NULL
   AND pay.purpose <> 'reservation_duplicate'::public.payment_purpose
   AND part.id::text = COALESCE(pay.metadata->>'participationId',
                                pay.metadata->>'reservationId');

-- A renewal names only its Stripe subscription; the family_subscriptions row
-- names the seat, and the seat its product. The product is the seat's current
-- one, so a renewal paid before a club switch is filed under the club the seat
-- moved to — the one approximation in this backfill. A renewal whose seat was
-- deleted before seats were kept has no family_subscriptions row left and stays
-- NULL on both; a later import of the Stripe history is what can fill those.
UPDATE public.payments pay
   SET participation_id = part.id,
       product_id = COALESCE(pay.product_id, part.product_id)
  FROM public.family_subscriptions fs
  JOIN public.participations part ON part.id = fs.participation_id
 WHERE pay.participation_id IS NULL
   AND pay.purpose = 'subscription_invoice'::public.payment_purpose
   AND fs.stripe_subscription_id = pay.metadata->>'stripeSubscriptionId';

-- A row that names a seat names that seat's product, whatever its metadata.
UPDATE public.payments pay
   SET product_id = part.product_id
  FROM public.participations part
 WHERE pay.product_id IS NULL
   AND part.id = pay.participation_id;

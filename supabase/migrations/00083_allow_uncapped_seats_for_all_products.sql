-- Allow any product type to be uncapped (seat_count = NULL).
--
-- Until now, chk_products_seat_count_null_requires_free tied a NULL seat_count
-- to free billing:
--   CHECK (seat_count IS NOT NULL OR billing_mode = 'free')
-- i.e. only free products (in practice, free events) could omit a seat cap;
-- every paid/external product was forced to carry one.
--
-- Product capacity is orthogonal to how a product is billed (schema §4.7): a
-- paid consumer club, camp, or municipality club may legitimately run without
-- a seat limit. The admin form now offers a "limited / no limit" choice for
-- every type, so we drop the constraint and let seat_count be NULL regardless
-- of billing_mode.
--
-- Safe by construction: seat_count IS NULL already means "unlimited" everywhere
-- it's read (participation creation skips the capacity check when it's NULL —
-- see create_participation), and the per-column CHECK (seat_count >= 1) and
-- chk_products_threshold_within_seat_count both already tolerate NULL.

ALTER TABLE public.products
  DROP CONSTRAINT chk_products_seat_count_null_requires_free;

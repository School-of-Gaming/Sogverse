-- Strengthen the link-row uniqueness on family_subscription_items_v2.
--
-- The original schema had `UNIQUE (family_subscription_id, participation_id)`,
-- which prevents the same participation appearing twice within a SINGLE
-- subscription but does NOT prevent two DIFFERENT subscriptions from each
-- linking the same participation. That gap matters for sub-switch flows
-- (e.g., monthly → yearly): if the new sub item is inserted before the old
-- one is deleted, the parent ends up paying TWO Stripe subscriptions for
-- ONE seat. The cron's `is_sub_covered` uses EXISTS, so it doesn't double-
-- charge from our side, but the parent's card still gets billed twice in
-- Stripe.
--
-- Replacing with a flat `UNIQUE(participation_id)` makes the strict
-- invariant explicit at the schema layer: "a participation is linked to at
-- most ONE active sub item, ever." Future sub-switch code is forced to
-- delete-then-insert, which is the correct shape anyway.
--
-- Doing this now while the table has 4 rows (zero duplicates) is a
-- no-data-migration change. After production accumulates rows the same
-- migration would require a data cleanup pass first.
--
-- The composite UNIQUE is dropped because the new single-column UNIQUE
-- subsumes it (any pair (sub, p) is implicitly unique if p alone is unique).

ALTER TABLE public.family_subscription_items_v2
  DROP CONSTRAINT family_subscription_items_v2_family_subscription_id_partici_key;

ALTER TABLE public.family_subscription_items_v2
  ADD CONSTRAINT family_subscription_items_v2_participation_id_key
    UNIQUE (participation_id);

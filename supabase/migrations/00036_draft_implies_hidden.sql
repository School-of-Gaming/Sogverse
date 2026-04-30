-- Enforce the invariant: a draft product cannot be visible to parents.
--
-- "Draft" means *the product is incomplete* — mandatory fields not yet
-- filled in. A product that's been published to parents is, by
-- definition, no longer a draft. The two sides of this rule should
-- never be in tension; if you're showing it to parents you've committed
-- to it.
--
-- Migration 00035 already realigned existing rows so no draft+visible
-- combinations exist today. This constraint locks the door behind it.
--
-- Direction of the implication: `status = 'draft' ⇒ is_visible = false`.
-- The reverse is fine — a hidden product can be in any status (pending,
-- cancelled, etc.) — hidden is "not shown to parents", not "incomplete".

ALTER TABLE public.products_v2
  ADD CONSTRAINT chk_products_v2_draft_implies_hidden
    CHECK (status <> 'draft' OR is_visible = false);

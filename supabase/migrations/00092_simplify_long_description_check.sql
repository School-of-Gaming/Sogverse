-- Simplify the long_description guard — supersedes 00091's function-backed CHECK.
--
-- long_description is written only by admins, only through the create_product /
-- update_product RPCs, only via the block-editor UI; and parseLongDescription
-- (src/types/index.ts) defends the renderer against any malformed value on read.
-- So a full per-element DB validator was more than the trust model warrants: it
-- only guarded against our own code writing bad JSON, at the cost of a dedicated
-- function, a grant, and an access-control allowlist entry.
--
-- Replace it with a one-line top-level type check — the one gross mistake worth
-- catching at the DB layer is a non-array landing in the column — and drop the
-- helper function (which also drops its grants).

ALTER TABLE public.product_translations
  DROP CONSTRAINT product_translations_long_description_check;

DROP FUNCTION IF EXISTS public.is_valid_product_long_description(jsonb);

ALTER TABLE public.product_translations
  ADD CONSTRAINT product_translations_long_description_check
  CHECK (long_description IS NULL OR jsonb_typeof(long_description) = 'array');

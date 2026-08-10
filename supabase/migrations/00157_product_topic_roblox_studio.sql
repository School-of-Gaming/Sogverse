-- Webinar leaves the product_topic enum; Roblox Studio takes its slot.
--
-- 'webinar' described *delivery*, which the model already expresses as
-- product_type = 'event' plus is_remote — and while it occupied a topic slot,
-- "a webinar about Minecraft" was unrepresentable. Nothing in the app ever
-- branched on the value, production has zero rows on it, and staging's 19
-- matrix fixtures were deleted ahead of this migration. Roblox Studio, by
-- contrast, is real subject matter about to be taught.
--
-- RENAME VALUE is the whole change on purpose: Postgres cannot drop an enum
-- value, and recreating the type would mean rebuilding the products.topic
-- column, its index, and the create_product / update_product signatures plus
-- their grants. The rename disturbs none of them. It preserves the value's
-- ordinal slot, which is irrelevant — display order is a hand-maintained
-- tuple in code (src/lib/products/topics.ts) and the enum's own order is
-- already meaningless.
--
-- The rename relabels rows rather than rejecting them: any product still on
-- 'webinar' would silently become a Roblox Studio product. Assert emptiness
-- first so that failure mode is loud instead.

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.products
   WHERE topic = 'webinar';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'refusing to rename product_topic ''webinar'': % product(s) still carry it',
      v_remaining;
  END IF;
END;
$$;

ALTER TYPE public.product_topic RENAME VALUE 'webinar' TO 'roblox_studio';

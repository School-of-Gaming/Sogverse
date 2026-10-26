--
-- Name: ensure_voice_join_instructions_iff_no_voice_room(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_voice_join_instructions_iff_no_voice_room() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_product_ids uuid[];
  v_product_id  uuid;
  v_mode        public.voice_room_mode;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    v_product_ids := ARRAY[NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    v_product_ids := ARRAY[NEW.product_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_product_ids := ARRAY[OLD.product_id];
  ELSE
    -- A translation moved to another product leaves its old one to be
    -- checked as well.
    v_product_ids := ARRAY[NEW.product_id, OLD.product_id];
  END IF;

  FOREACH v_product_id IN ARRAY v_product_ids LOOP
    -- Locked, so two transactions that each clear a different locale's
    -- instructions are judged one after the other: the second waits for the
    -- first to commit, and its count below then sees what the first left.
    SELECT voice_room_mode INTO v_mode
      FROM public.products
     WHERE id = v_product_id
       FOR UPDATE;

    -- The product was deleted in this transaction, its translations cascading
    -- away with it: there is nothing left to keep in step.
    CONTINUE WHEN NOT FOUND;

    IF v_mode = 'none' AND NOT EXISTS (
      SELECT 1 FROM public.product_translations
       WHERE product_id = v_product_id
         AND voice_join_instructions IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Product % has no voice room, so at least one translation needs join instructions', v_product_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_mode <> 'none' AND EXISTS (
      SELECT 1 FROM public.product_translations
       WHERE product_id = v_product_id
         AND voice_join_instructions IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Product % has voice room mode %, and join instructions belong only to a product with no voice room', v_product_id, v_mode
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION ensure_voice_join_instructions_iff_no_voice_room(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_voice_join_instructions_iff_no_voice_room() IS 'Deferred constraint trigger on products (INSERT, UPDATE OF voice_room_mode) and on product_translations (INSERT, UPDATE OF voice_join_instructions or product_id, DELETE): a product''s voice_room_mode is none exactly when at least one of its translations carries voice_join_instructions. Deferred to commit because the mode and the instructions are written by separate statements of one transaction — create_product inserts the product before its translations, and update_product updates the product before it replaces them — so only the finished state can be judged. Checks the product the row names, and the product it left when an UPDATE moves a translation; skips a product that no longer exists, which is how deleting a whole product, its translations cascading away, commits. Locks the product row before counting, so two concurrent transactions that each clear a different locale''s instructions cannot both commit. Refuses with 23514.';


--
-- Name: FUNCTION ensure_voice_join_instructions_iff_no_voice_room(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_voice_join_instructions_iff_no_voice_room() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_voice_join_instructions_iff_no_voice_room() TO service_role;



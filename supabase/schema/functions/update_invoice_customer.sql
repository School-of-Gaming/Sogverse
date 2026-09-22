--
-- Name: update_invoice_customer(uuid, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text DEFAULT 'FI'::text, p_your_reference text DEFAULT NULL::text, p_invoice_text text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_customer_no    text;
  v_invoice_name   text;
  v_street         text;
  v_postal_code    text;
  v_city           text;
  v_country_code   text;
  v_your_reference text;
  v_invoice_text   text;
BEGIN
  PERFORM public.assert_admin();

  v_customer_no    := btrim(COALESCE(p_fennoa_customer_no, ''));
  v_invoice_name   := btrim(COALESCE(p_invoice_name, ''));
  v_street         := btrim(COALESCE(p_street, ''));
  v_postal_code    := btrim(COALESCE(p_postal_code, ''));
  v_city           := btrim(COALESCE(p_city, ''));
  v_country_code   := upper(btrim(COALESCE(p_country_code, '')));
  v_your_reference := NULLIF(btrim(COALESCE(p_your_reference, '')), '');
  v_invoice_text   := NULLIF(btrim(COALESCE(p_invoice_text, '')), '');

  -- The same eight lines its create sibling carries, for the reason stated
  -- there: a private validator would be a third function no role may call.
  IF v_customer_no = '' THEN
    RAISE EXCEPTION 'A Fennoa customer number is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice_name = '' THEN
    RAISE EXCEPTION 'An invoice name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_street = '' OR v_postal_code = '' OR v_city = '' THEN
    RAISE EXCEPTION 'A street, postal code and city are required — the Finvoice import refuses a file with no buyer address'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'The country must be a two-letter ISO 3166-1 code (got %)', v_country_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it: a column this
  -- function does not know about is cleared by the next admin edit. Both
  -- optional fields are exactly that shape — their parameters default NULL, so
  -- an omitting caller clears them, which IS how one is cleared, and the wire
  -- schema demanding the field is what stops it happening by accident.
  UPDATE public.invoice_customers SET
    fennoa_customer_no = v_customer_no,
    invoice_name       = v_invoice_name,
    street             = v_street,
    postal_code        = v_postal_code,
    city               = v_city,
    country_code       = v_country_code,
    your_reference     = v_your_reference,
    invoice_text       = v_invoice_text
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice customer not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$_$;


--
-- Name: FUNCTION update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) IS 'Admin-gated edit of a Fennoa invoice customer — the second and last way a row in invoice_customers changes, because the table carries no write grant for authenticated. SECURITY DEFINER with an empty search_path, guard-first on assert_admin(), not STRICT for the reason its create sibling is not, and returns the edited row''s id. It ASSIGNS EVERY EDITABLE COLUMN on every call, so a column added later has to reach this statement in the same change or the next admin edit clears it. Both optional fields have that shape already: their parameters default NULL, so omission is how one is cleared — the only expressible way — and the wire schema demanding the field on every save is what keeps a clearing deliberate. Normalisation and validation are its create sibling''s, unchanged: trimmed text, an upper-cased country code, a blank optional field folded to NULL, and check_violation carrying a sentence. An id no customer has raises no_data_found rather than silently affecting zero rows, because an edit that changed nothing and said so is a save the admin would believe.';


--
-- Name: FUNCTION update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) TO authenticated;
GRANT ALL ON FUNCTION public.update_invoice_customer(p_id uuid, p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) TO service_role;



--
-- Name: create_invoice_customer(text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text DEFAULT 'FI'::text, p_your_reference text DEFAULT NULL::text, p_invoice_text text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_id             uuid;
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

  -- Written out here and again in update_invoice_customer rather than factored
  -- into a shared assertion: a private helper would be a third function in the
  -- schema that no role may call, and the two copies are the same eight lines
  -- next to each other in one file.
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

  INSERT INTO public.invoice_customers (
    fennoa_customer_no, invoice_name, street, postal_code, city,
    country_code, your_reference, invoice_text
  )
  VALUES (
    v_customer_no, v_invoice_name, v_street, v_postal_code, v_city,
    v_country_code, v_your_reference, v_invoice_text
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$_$;


--
-- Name: FUNCTION create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) IS 'Admin-gated create of a Fennoa invoice customer, and one of the two ways any row reaches invoice_customers at all: the table carries no write grant for authenticated, so a browser''s only path in is this function. SECURITY DEFINER with an empty search_path, guard-first on assert_admin() so the authorization decision is made before an argument is read, and deliberately not STRICT — a STRICT function skips its body on NULL input and would skip the guard with it. Returns the new row''s id. Every text field is trimmed and the country code upper-cased before the write, and a blank optional field folds to NULL, so "no reference" is one state rather than two; the table''s own CHECKs are the backstop for any row arriving another way. The validation mirrors those CHECKs and raises check_violation with a readable sentence, because the admin form shows an RPC''s message verbatim and a raw constraint name is not something an admin can act on. p_country_code defaults to FI, the column''s own default and the resting state of a Finnish contract system, so an omitting caller writes FI rather than failing; p_your_reference and p_invoice_text default NULL because null is their legal empty and codegen cannot express an explicit null for a non-defaulted argument — which is why the wire schema demands both fields, so omission stays deliberate.';


--
-- Name: FUNCTION create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_customer(p_fennoa_customer_no text, p_invoice_name text, p_street text, p_postal_code text, p_city text, p_country_code text, p_your_reference text, p_invoice_text text) TO service_role;



--
-- Name: check_testimonial_version(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE
  v_quote text := btrim(COALESCE(p_quote, ''));
BEGIN
  IF btrim(COALESCE(p_attribution, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs to say whom the quote is from', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_quote = '' THEN
    RAISE EXCEPTION 'The % version needs its quote', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The table's CHECK refuses this too; saying it in a sentence is what lets
  -- the refusal reach an admin as something they can act on.
  IF v_quote ~ '^["“”„‟«»‹›‘‚‛「」『』]' OR v_quote ~ '["“”„‟«»‹›‘‚‛「」『』]$' THEN
    RAISE EXCEPTION 'The % version''s quote starts or ends with a quotation mark. Leave the marks out: the site adds them in each language''s own style.', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$_$;


--
-- Name: FUNCTION check_testimonial_version(p_locale text, p_attribution text, p_quote text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) IS 'The version rule every testimonial writer checks before it writes, refusing with a sentence an admin can act on (check_violation naming the locale): whom it is from is written, the quote is written, and the quote does not start or end with a quotation mark (the marks chk_testimonial_translations_quote_unquoted names). Not exposed: granted to no Data API role but the service role.';


--
-- Name: FUNCTION check_testimonial_version(p_locale text, p_attribution text, p_quote text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) TO service_role;



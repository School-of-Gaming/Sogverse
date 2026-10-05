--
-- Name: product_required_qualifications(public.product_type, public.product_tag); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag DEFAULT NULL::public.product_tag) RETURNS public.gedu_qualification[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p_tag = 'neuroinclusive'::public.product_tag
      THEN 'neuroinclusive'::public.gedu_qualification END,
    CASE WHEN p_product_type IN (
           'consumer_club'::public.product_type,
           'camp'::public.product_type,
           'event'::public.product_type
         )
      THEN 'consumer_products'::public.gedu_qualification END
  ], NULL);
$$;


--
-- Name: FUNCTION product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) IS 'Internal: the gedu qualifications a product requires of whoever runs a session of it, in the enum''s declared order — neuroinclusive when the product is tagged neuroinclusive, consumer_products when it is a consumer_club, camp or event (everything but municipality_club). Empty when it requires nothing. p_tag defaults to NULL, an untagged product, which is how a Data API caller asks about one. The one statement of that mapping in the database; the app carries a mirror of it, and a DB test enumerating every product type and tag holds the two in agreement. Not granted to `authenticated`.';


--
-- Name: FUNCTION product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_required_qualifications(p_product_type public.product_type, p_tag public.product_tag) TO service_role;



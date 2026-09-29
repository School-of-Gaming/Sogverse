--
-- Name: refuse_catalogue_image_purpose_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refuse_catalogue_image_purpose_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'catalogue_images row % is a % picture, and an entry''s purpose never changes', OLD.id, OLD.purpose
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION refuse_catalogue_image_purpose_change(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.refuse_catalogue_image_purpose_change() IS 'BEFORE UPDATE on catalogue_images: refuses (23514) any update that changes purpose. The entry''s object lives in its purpose''s bucket, and every product and Library cover linking it was checked against its purpose when it linked, so a changed purpose would leave the row naming the wrong bucket and its links holding a picture they may not show. The label, the only column the admin UI edits, is unaffected.';


--
-- Name: FUNCTION refuse_catalogue_image_purpose_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refuse_catalogue_image_purpose_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refuse_catalogue_image_purpose_change() TO service_role;



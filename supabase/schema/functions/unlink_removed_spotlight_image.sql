--
-- Name: unlink_removed_spotlight_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlink_removed_spotlight_image() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.purpose <> 'spotlight_image' THEN
    RETURN OLD;
  END IF;

  -- One statement takes the picture off and switches the spotlight off, so
  -- the enabled-needs-a-picture CHECK never sees an enabled spotlight with
  -- none. Done before the entry goes, which is what lets the foreign key take
  -- no action of its own.
  UPDATE public.spotlights
     SET image_id = NULL,
         enabled  = false
   WHERE image_id = OLD.id;

  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION unlink_removed_spotlight_image(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.unlink_removed_spotlight_image() IS 'BEFORE DELETE on catalogue_images: the spotlights'' half of a removal. Every spotlight showing a removed spotlight_image entry loses its picture and is switched off in the same statement — an enabled spotlight cannot be without a picture (chk_spotlights_enabled_has_image), so a removed picture drops its spotlights out of the session report emails until an admin gives each another picture and switches it back on. SECURITY DEFINER because the remover is an admin''s own session and spotlights carries no write grant.';


--
-- Name: FUNCTION unlink_removed_spotlight_image(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unlink_removed_spotlight_image() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_removed_spotlight_image() TO service_role;



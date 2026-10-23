--
-- Name: check_landing_section_picks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_landing_section_picks() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_type    text := TG_ARGV[0];
  v_key     text := TG_ARGV[1];
  v_table   text := TG_ARGV[2];
  v_noun    text := TG_ARGV[3];
  v_verb    text := TG_ARGV[4];
  v_before  text[] := ARRAY[]::text[];
  v_section bigint;
  v_ids     text[];
  v_count   integer := 0;
  v_parts   text[] := ARRAY[]::text[];
BEGIN
  -- The key holds a list of ids, or a single id; a single one is read as a
  -- list of one.
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.sections) = 'array' THEN
    SELECT COALESCE(array_agg(p.e #>> '{}'), ARRAY[]::text[]) INTO v_before
      FROM jsonb_array_elements(OLD.sections) AS s(e),
           jsonb_array_elements(
             CASE WHEN s.e->>'type' IS DISTINCT FROM v_type THEN '[]'::jsonb
                  WHEN jsonb_typeof(s.e->v_key) = 'array'  THEN s.e->v_key
                  WHEN jsonb_typeof(s.e->v_key) = 'string' THEN jsonb_build_array(s.e->v_key)
                  ELSE '[]'::jsonb END
           ) AS p(e);
  END IF;

  IF jsonb_typeof(NEW.sections) IS DISTINCT FROM 'array' THEN
    RETURN NEW;
  END IF;

  -- Every unknown id the save adds, per section in the structure's order and
  -- within one in the order it names them, so one refusal names them all.
  FOR v_section, v_ids IN EXECUTE format($q$
    SELECT pick.n, array_agg(pick.id ORDER BY pick.k)
      FROM (
        SELECT s.n, p.k, p.e #>> '{}' AS id
          FROM jsonb_array_elements($1) WITH ORDINALITY AS s(e, n),
               jsonb_array_elements(
                 CASE WHEN s.e->>'type' IS DISTINCT FROM $2 THEN '[]'::jsonb
                      WHEN jsonb_typeof(s.e->$3) = 'array'  THEN s.e->$3
                      WHEN jsonb_typeof(s.e->$3) = 'string' THEN jsonb_build_array(s.e->$3)
                      ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS p(e, k)
         WHERE jsonb_typeof(p.e) = 'string'
      ) AS pick
     WHERE NOT (pick.id = ANY ($4))
       AND NOT EXISTS (
         SELECT 1 FROM public.%I r
          WHERE r.id = CASE WHEN pick.id ~ $5 THEN pick.id::uuid END
       )
     GROUP BY pick.n
     ORDER BY pick.n
  $q$, v_table)
    USING NEW.sections, v_type, v_key, v_before, c_uuid
  LOOP
    v_count := v_count + cardinality(v_ids);
    v_parts := v_parts || format('section %s %s %s', v_section, v_verb,
      CASE WHEN cardinality(v_ids) = 1 THEN v_ids[1]
           ELSE array_to_string(v_ids[1:cardinality(v_ids) - 1], ', ') || ' and ' || v_ids[cardinality(v_ids)]
      END);
  END LOOP;

  -- One unknown id keeps the sentence naming it alone; several are listed.
  IF v_count = 1 THEN
    RAISE EXCEPTION 'Section % % the % %, and no % has that id', v_section, v_verb, v_noun, v_ids[1], v_noun
      USING ERRCODE = 'foreign_key_violation';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'No % has these ids: %', v_noun, array_to_string(v_parts, '; ')
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: FUNCTION check_landing_section_picks(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_landing_section_picks() IS 'BEFORE INSERT OR UPDATE OF sections on landing_pages (the working copy alone), attached once per section type that names rows of another table by id. Its trigger arguments are the section type, the key holding the ids — a list of ids, or a single id — the public table they name, and the noun and verb of the refusal. It refuses a save whose sections of that type name an id no row of that table has, with foreign_key_violation naming the section by its number from one and the id ("Section 2 picks the product <id>, and no product has that id"); a save adding several such ids is refused once, naming every one by its section ("No product has these ids: section 2 picks <id> and <id>; section 4 picks <id>"). Each type is its own trigger, so a save adding unknown ids of two types is refused for the first trigger''s type alone. Only ids the save adds are checked — on an update, an id the stored structure already held is left alone — so a write that moves only the structure''s other contents (a catalogue picture''s replace or removal) is never refused by an id it did not add. No foreign key can reach into the structure, which is why this is a trigger. The published copy has no such check: a testimonial or a guide is never deleted by the app, and a product pick that has ended or been unlisted is not an error, since the public page leaves out whatever the listing does not hold.';


--
-- Name: FUNCTION check_landing_section_picks(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_landing_section_picks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_landing_section_picks() TO service_role;



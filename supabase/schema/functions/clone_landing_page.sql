--
-- Name: clone_landing_page(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_sections  jsonb;
  v_section   jsonb;
  v_field     text;
  v_value     jsonb;
  v_list      jsonb;
  v_item      jsonb;
  v_new_item  text;
  v_items     jsonb;
  -- Each source section id to its copy's, and to its own item map.
  v_ids       jsonb := '{}'::jsonb;
  v_item_ids  jsonb := '{}'::jsonb;
  v_copy      jsonb := '[]'::jsonb;
  v_sent      jsonb;
  v_locale    text;
  v_source    record;
  v_texts     jsonb;
  v_base      text;
  v_slug      text;
  v_n         integer;
  v_versions  jsonb := '[]'::jsonb;
  v_new_id    uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Shared, so no write to the source lands while it is being copied.
  SELECT sections INTO v_sections
    FROM public.landing_pages
   WHERE id = p_id
     FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Landing page not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A landing page needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT e->>'locale') <> count(*)
        FROM jsonb_array_elements(p_versions) AS t(e)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  SELECT e->>'locale' INTO v_locale
    FROM jsonb_array_elements(p_versions) AS t(e)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.landing_page_translations
      WHERE page_id = p_id AND locale = e->>'locale')
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The page has no % version to copy', COALESCE(v_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The structure, with a new id for every section and item.
  FOR v_section IN
    SELECT e FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS t(e, n) ORDER BY n
  LOOP
    v_items := '{}'::jsonb;

    FOR v_field, v_value IN
      SELECT key, value FROM jsonb_each(v_section) WHERE jsonb_typeof(value) = 'array'
    LOOP
      v_list := '[]'::jsonb;
      FOR v_item IN
        SELECT e FROM jsonb_array_elements(v_value) WITH ORDINALITY AS t(e, n) ORDER BY n
      LOOP
        IF jsonb_typeof(v_item) = 'object' AND jsonb_typeof(v_item->'id') = 'string' THEN
          v_new_item := gen_random_uuid()::text;
          v_items := v_items || jsonb_build_object(v_item->>'id', v_new_item);
          v_item := v_item || jsonb_build_object('id', v_new_item);
        END IF;
        v_list := v_list || jsonb_build_array(v_item);
      END LOOP;
      v_section := v_section || jsonb_build_object(v_field, v_list);
    END LOOP;

    v_ids := v_ids || jsonb_build_object(v_section->>'id', gen_random_uuid()::text);
    v_item_ids := v_item_ids || jsonb_build_object(v_section->>'id', v_items);
    v_copy := v_copy
      || jsonb_build_array(v_section || jsonb_build_object('id', v_ids->>(v_section->>'id')));
  END LOOP;

  -- Each named language: its words re-keyed, its new title, its free slug.
  FOR v_source IN
    SELECT t.locale, t.summary, t.section_texts
      FROM public.landing_page_translations t
     WHERE t.page_id = p_id
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_versions) AS s(e)
                    WHERE s.e->>'locale' = t.locale)
     ORDER BY t.locale
  LOOP
    SELECT e INTO v_sent
      FROM jsonb_array_elements(p_versions) AS t(e)
     WHERE e->>'locale' = v_source.locale;

    SELECT COALESCE(jsonb_object_agg(v_ids->>s.key, (
             SELECT COALESCE(jsonb_object_agg(f.key,
                      CASE WHEN jsonb_typeof(f.value) = 'object' THEN (
                        SELECT COALESCE(jsonb_object_agg((v_item_ids->s.key)->>i.key, i.value), '{}'::jsonb)
                          FROM jsonb_each(f.value) AS i(key, value)
                         WHERE (v_item_ids->s.key) ? i.key)
                      ELSE f.value END), '{}'::jsonb)
               FROM jsonb_each(s.value) AS f(key, value))), '{}'::jsonb)
      INTO v_texts
      FROM jsonb_each(v_source.section_texts) AS s(key, value)
     WHERE v_ids ? s.key
       AND jsonb_typeof(s.value) = 'object';

    -- The first slug no page holds in this locale, working or live; none at
    -- all when the title derives none.
    v_base := COALESCE(btrim(v_sent->>'default_slug'), '');
    v_slug := v_base;
    v_n := 1;
    WHILE v_slug <> '' AND (
            EXISTS (SELECT 1 FROM public.landing_page_translations
                     WHERE locale = v_source.locale AND slug = v_slug)
         OR EXISTS (SELECT 1 FROM public.landing_page_publication_translations
                     WHERE locale = v_source.locale AND slug = v_slug))
    LOOP
      v_n := v_n + 1;
      v_slug := rtrim(left(v_base, 80 - char_length('-' || v_n)), '-') || '-' || v_n;
    END LOOP;

    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'locale',        v_source.locale,
      'title',         v_sent->>'title',
      'summary',       v_source.summary,
      'slug',          v_slug,
      'section_texts', v_texts));
  END LOOP;

  -- As create_landing_page writes a new page: an empty structure stands in
  -- until the save writes the copy; a refusal there aborts the whole call.
  INSERT INTO public.landing_pages (author_id, sections)
  VALUES (auth.uid(), '[]'::jsonb)
  RETURNING id INTO v_new_id;

  PERFORM public.save_landing_page(v_new_id, v_copy, v_versions);

  RETURN v_new_id;
END;
$$;


--
-- Name: FUNCTION clone_landing_page(p_id uuid, p_versions jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) IS 'Admin-gated clone of a landing page''s working copy into a new, unpublished page; returns its id. p_versions names the languages to copy, a JSON array of {locale, title, default_slug}: the copy''s title in that language and the slug the application derives from it. Each named language''s summary and words are copied from the source, re-keyed to the copy''s ids; the structure is copied with a new id for every section and every item (any object with an id inside a section''s array field), pictures included. A default_slug another page holds in that locale, working or live, takes the first free number (<slug>-2, …, cut to 80 characters). Written through save_landing_page on a new row, as create_landing_page writes one, whose rules and refusals are this function''s. An id no page has raises no_data_found; a named language the source lacks raises check_violation; no language, or p_versions not an array, or a language named twice, raises check_violation or 22023. SECURITY DEFINER because no landing page table carries a write grant.';


--
-- Name: FUNCTION clone_landing_page(p_id uuid, p_versions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.clone_landing_page(p_id uuid, p_versions jsonb) TO service_role;



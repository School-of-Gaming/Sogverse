--
-- Name: landing_version_missing(jsonb, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_section jsonb;
  v_id      text;
  v_type    text;
  v_texts   jsonb;
  v_item    jsonb;
  v_iid     text;
  v_prefix  text;
BEGIN
  IF COALESCE(p_title, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'title');
  END IF;
  IF COALESCE(p_summary, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'summary');
  END IF;
  IF COALESCE(p_slug, '') !~ '\S' THEN
    v_missing := array_append(v_missing, 'slug');
  END IF;

  IF jsonb_typeof(p_sections) IS DISTINCT FROM 'array' THEN
    RETURN v_missing;
  END IF;

  FOR v_section IN
    SELECT e FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS t(e, n) ORDER BY n
  LOOP
    v_id     := v_section->>'id';
    v_type   := v_section->>'type';
    v_texts  := COALESCE(p_section_texts->v_id, '{}'::jsonb);
    v_prefix := 'sections.' || v_id || '.';

    CASE v_type
      WHEN 'hero' THEN
        IF NOT public.landing_text_is_written(v_texts->'headline') THEN
          v_missing := array_append(v_missing, v_prefix || 'headline');
        END IF;
        IF v_section ? 'button' AND NOT public.landing_text_is_written(v_texts->'buttonLabel') THEN
          v_missing := array_append(v_missing, v_prefix || 'buttonLabel');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      WHEN 'text' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF NOT public.landing_text_is_written(v_texts->'body') THEN
          v_missing := array_append(v_missing, v_prefix || 'body');
        END IF;
        IF v_section ? 'imageId' AND NOT public.landing_text_is_written(v_texts->'imageAlt') THEN
          v_missing := array_append(v_missing, v_prefix || 'imageAlt');
        END IF;
      WHEN 'image' THEN
        FOR v_item IN
          SELECT e FROM jsonb_array_elements(COALESCE(v_section->'images', '[]'::jsonb)) WITH ORDINALITY AS t(e, n) ORDER BY n
        LOOP
          v_iid := v_item->>'id';
          IF NOT public.landing_text_is_written(v_texts->'alts'->v_iid) THEN
            v_missing := array_append(v_missing, v_prefix || 'alts.' || v_iid);
          END IF;
        END LOOP;
      WHEN 'points', 'steps', 'faq' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        FOR v_item IN
          SELECT e FROM jsonb_array_elements(COALESCE(v_section->'items', '[]'::jsonb)) WITH ORDINALITY AS t(e, n) ORDER BY n
        LOOP
          v_iid := v_item->>'id';
          IF v_type = 'faq' THEN
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'question') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.question');
            END IF;
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'answer') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.answer');
            END IF;
          ELSE
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'title') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.title');
            END IF;
            IF NOT public.landing_text_is_written(v_texts->'items'->v_iid->'body') THEN
              v_missing := array_append(v_missing, v_prefix || 'items.' || v_iid || '.body');
            END IF;
          END IF;
        END LOOP;
      WHEN 'cta' THEN
        IF NOT public.landing_text_is_written(v_texts->'heading') THEN
          v_missing := array_append(v_missing, v_prefix || 'heading');
        END IF;
        IF NOT public.landing_text_is_written(v_texts->'buttonLabel') THEN
          v_missing := array_append(v_missing, v_prefix || 'buttonLabel');
        END IF;
      ELSE
        NULL;
    END CASE;
  END LOOP;

  RETURN v_missing;
END;
$$;


--
-- Name: FUNCTION landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) IS 'The SQL half of the landing pages'' required-text rule: what one language version still needs before publishing takes it, given the page''s structure, as a list of paths — title, summary, slug, then per section in order sections.<id>.<field>, sections.<id>.items.<item id>.<field> or sections.<id>.alts.<picture item id>. Empty means complete. Required: hero headline, its buttonLabel when it has a button and its imageAlt when it has a picture; text heading, body and imageAlt with a picture; image an alt per picture; points and steps heading and each item''s title and body; faq heading and each item''s question and answer; cta heading and buttonLabel. Written means landing_text_is_written. The TypeScript rule in src/lib/landing-pages/sections/ is the other half, and a DB test holds the two equal.';


--
-- Name: FUNCTION landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_version_missing(p_sections jsonb, p_title text, p_summary text, p_slug text, p_section_texts jsonb) TO service_role;



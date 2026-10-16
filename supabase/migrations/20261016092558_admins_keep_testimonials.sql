-- Admins keep testimonials.
--
-- A testimonial is real words from a real parent, gamer or gedu, kept by
-- Marketing in one store, and the public pages show the ones placed there.
--
-- THE SHAPE
--
-- 1. One row per testimonial in `testimonials`, carrying nothing but who
--    created it and when, and who last saved it and when, and through which
--    AI app — all stamped by a trigger, never by a writer.
-- 2. A version per site locale in `testimonial_translations`: whom the quote
--    is from (`attribution`, whatever short text the admin attributes it to)
--    and the quote. Both required in every version, at least one version per
--    testimonial, so a reader's fallback (their locale, then English, then the
--    first written) always finds one.
-- 3. **Quotation marks are never part of the stored quote.** Each locale
--    quotes in its own style, and the page wraps the quote in its reader's
--    marks. A quote that starts or ends with a quotation mark is refused, not
--    stripped: the writer is told to leave the marks out, and nothing changes
--    their words behind their back. The straight and typographic apostrophes
--    are not on the list, because several languages start or end a word with
--    one (Klingon writes a letter with it).
-- 4. Nothing else: no original language, no status, no kind of giver, no
--    names, places, photos or dates of the admin's own.
--
-- THE HOME SPOTS
--
-- The home page shows testimonials in three named spots, and About shows
-- exactly the same ones in the same three groups: `feature` (the single quote
-- under the hero, 1), `safety` (beside the safety facts, 2) and `row` (the
-- "What parents tell us" row, 3). `home_testimonials` holds which testimonial
-- fills which position of which spot. **Its rows are written only by
-- migrations**: the home and About pages are the site's front door, so which
-- testimonial sits where is a developer's decision, made in a migration, while
-- the words are an admin's. No Data API role holds a write grant on it and no
-- function writes it.
--
-- A placed testimonial cannot be deleted: delete_testimonial refuses it with a
-- sentence naming the spot, and the foreign key restricts beneath it. Editing
-- a placed testimonial's words is allowed — the admin page lists where it is
-- used, which is what makes that a visible decision.
--
-- ACCESS
--
-- The store is Marketing's internal collection: admin-only for the Data API,
-- SELECT for authenticated behind an admin policy, nothing for anon, and no
-- write grant — the writers are the admin-guarded functions below. The public
-- reads the placed testimonials alone, through list_home_testimonials.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.testimonials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_via    uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_saved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_saved_via uuid
);

COMMENT ON TABLE public.testimonials IS 'Marketing''s store of testimonials — real words from real parents, gamers and gedus: the record of who created each and who last saved it here, the words per language in testimonial_translations. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_testimonial, save_testimonial, save_testimonial_version, remove_testimonial_version and delete_testimonial. The public reads only the testimonials placed on the home page, through list_home_testimonials.';
COMMENT ON COLUMN public.testimonials.created_at IS 'When the testimonial was created, stamped by stamp_testimonial_saver and never moved.';
COMMENT ON COLUMN public.testimonials.created_by IS 'The admin who created the testimonial, stamped from auth.uid() by stamp_testimonial_saver and never changed by a save. NULL when the create had no signed-in caller (a migration, the service role, psql) or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.testimonials.created_via IS 'The OAuth client — an AI app connected through the MCP endpoint — the create came through, read from the token''s client_id claim by stamp_testimonial_saver. NULL for a create made in Sogverse itself, and whenever created_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';
COMMENT ON COLUMN public.testimonials.updated_at IS 'When the testimonial was last saved, its versions included, stamped by stamp_testimonial_saver: every writer names this column, which is what fires the trigger.';
COMMENT ON COLUMN public.testimonials.last_saved_by IS 'The admin whose write last saved the testimonial, stamped from auth.uid() by stamp_testimonial_saver and never supplied by a statement. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';
COMMENT ON COLUMN public.testimonials.last_saved_via IS 'The OAuth client the last save came through, read from the token''s client_id claim by stamp_testimonial_saver. NULL for a save made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key, as created_via.';

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_testimonials ON public.testimonials
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.testimonials TO authenticated;
GRANT ALL ON TABLE public.testimonials TO service_role;

CREATE TABLE public.testimonial_translations (
  testimonial_id uuid NOT NULL REFERENCES public.testimonials(id) ON DELETE CASCADE,
  locale         text NOT NULL,
  attribution    text NOT NULL,
  quote          text NOT NULL,
  PRIMARY KEY (testimonial_id, locale),
  CONSTRAINT chk_testimonial_translations_locale_format CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'),
  CONSTRAINT chk_testimonial_translations_attribution_present CHECK (btrim(attribution) <> ''),
  CONSTRAINT chk_testimonial_translations_quote_present CHECK (btrim(quote) <> ''),
  CONSTRAINT chk_testimonial_translations_quote_unquoted CHECK (
    quote !~ '^[[:space:]]*["“”„‟«»‹›‘‚‛「」『』]'
    AND quote !~ '["“”„‟«»‹›‘‚‛「」『』][[:space:]]*$'
  )
);

COMMENT ON TABLE public.testimonial_translations IS 'One language version of a testimonial: whom it is from and the quote, in one site locale. Any set of locales, at least one per testimonial: the writers refuse an empty set and refuse removing the last version. Readers pick their version by their locale, then English, then the first written. Admin-only for the Data API, as testimonials is.';
COMMENT ON COLUMN public.testimonial_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';
COMMENT ON COLUMN public.testimonial_translations.attribution IS 'Whom the quote is from, in this language — whatever short text the admin attributes it to ("Mum, Finland", "Gedu Pixel"). Plain text, trimmed, required. The app calls it the testimonial''s "from".';
COMMENT ON COLUMN public.testimonial_translations.quote IS 'The words, in this language: plain text, trimmed, required, and never wrapped in quotation marks — the page wraps it in its reader''s locale''s marks (chk_testimonial_translations_quote_unquoted).';
COMMENT ON CONSTRAINT chk_testimonial_translations_quote_unquoted ON public.testimonial_translations IS 'A quote never starts or ends with a quotation mark — straight or typographic double marks, low marks, guillemets, single typographic marks other than the apostrophe, and corner brackets. The page adds the reader''s locale''s own marks. The apostrophes are allowed at either end, since a word may start or end with one. The writers refuse such a quote with a sentence first.';

ALTER TABLE public.testimonial_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_testimonial_translations ON public.testimonial_translations
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.testimonial_translations TO authenticated;
GRANT ALL ON TABLE public.testimonial_translations TO service_role;

CREATE TYPE public.home_testimonial_spot AS ENUM ('feature', 'safety', 'row');

COMMENT ON TYPE public.home_testimonial_spot IS 'A named place on the home page that shows testimonials, About showing the same ones in the same groups: feature (the single quote under the hero, one testimonial), safety (beside the safety facts, two) and row (the "What parents tell us" row, three).';

CREATE TABLE public.home_testimonials (
  spot           public.home_testimonial_spot NOT NULL,
  position       smallint NOT NULL,
  testimonial_id uuid NOT NULL REFERENCES public.testimonials(id) ON DELETE RESTRICT,
  PRIMARY KEY (spot, position),
  CONSTRAINT uq_home_testimonials_testimonial UNIQUE (testimonial_id),
  CONSTRAINT chk_home_testimonials_spot_size CHECK (
    position >= 1
    AND position <= CASE spot
                      WHEN 'feature' THEN 1
                      WHEN 'safety'  THEN 2
                      WHEN 'row'     THEN 3
                    END
  )
);

COMMENT ON TABLE public.home_testimonials IS 'Which testimonial fills which position of which home spot; About shows the same testimonials in the same groups. Written only by migrations: which testimonial sits where on the site''s front door is a developer''s decision, while its words are an admin''s, so no Data API role holds a write grant and no function writes it. A spot may be partly filled or empty. SELECT for authenticated behind an admin policy; the public reads it through list_home_testimonials.';
COMMENT ON COLUMN public.home_testimonials.position IS 'The testimonial''s place within its spot, from 1, in reading order. At most the spot''s size (chk_home_testimonials_spot_size).';
COMMENT ON COLUMN public.home_testimonials.testimonial_id IS 'The testimonial shown there. A testimonial is in at most one home position (uq_home_testimonials_testimonial), so About never shows it twice. RESTRICT: a placed testimonial cannot be deleted — delete_testimonial refuses it first, naming the spot.';
COMMENT ON CONSTRAINT chk_home_testimonials_spot_size ON public.home_testimonials IS 'A spot holds at most its size: feature 1, safety 2, row 3.';

ALTER TABLE public.home_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_home_testimonials ON public.home_testimonials
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.home_testimonials TO authenticated;
GRANT ALL ON TABLE public.home_testimonials TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Who created it and who last saved it
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.stamp_testimonial_saver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_by  uuid := auth.uid();
  v_via uuid;
BEGIN
  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF v_by IS NOT NULL THEN
    v_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at  := now();
    NEW.created_by  := v_by;
    NEW.created_via := v_via;
  ELSE
    NEW.created_at  := OLD.created_at;
    NEW.created_by  := OLD.created_by;
    NEW.created_via := OLD.created_via;
  END IF;

  NEW.updated_at     := now();
  NEW.last_saved_by  := v_by;
  NEW.last_saved_via := v_via;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_testimonial_saver() IS 'BEFORE INSERT, and BEFORE UPDATE OF updated_at, on testimonials: stamps who created the testimonial and when on the insert (and keeps them on every update), and who last saved it, when, and through which AI app (the token''s client_id claim) on both, overwriting whatever the statement said — so it is those columns'' only writer. Every testimonial writer names updated_at. The column list keeps a profile deletion''s SET NULL on created_by or last_saved_by from being re-stamped as a save by whoever deleted the account.';

REVOKE ALL ON FUNCTION public.stamp_testimonial_saver() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stamp_testimonial_saver() TO service_role;

CREATE TRIGGER trg_testimonials_stamp_saver
  BEFORE INSERT OR UPDATE OF updated_at ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.stamp_testimonial_saver();

-- ---------------------------------------------------------------------------
-- 3. The writers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
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
$$;

COMMENT ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) IS 'The version rule every testimonial writer checks before it writes, refusing with a sentence an admin can act on (check_violation naming the locale): whom it is from is written, the quote is written, and the quote does not start or end with a quotation mark (the marks chk_testimonial_translations_quote_unquoted names). Not exposed: granted to no Data API role but the service role.';

REVOKE ALL ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_testimonial_version(p_locale text, p_attribution text, p_quote text) TO service_role;

CREATE FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_version record;
BEGIN
  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'A testimonial needs at least one language version'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_version IN
    SELECT r.locale, r.attribution, r.quote
      FROM jsonb_to_recordset(p_versions) AS r(locale text, attribution text, quote text)
  LOOP
    PERFORM public.check_testimonial_version(v_version.locale, v_version.attribution, v_version.quote);
  END LOOP;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.testimonial_translations t
   WHERE t.testimonial_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.testimonial_translations AS t (testimonial_id, locale, attribution, quote)
  SELECT p_id, r.locale, btrim(r.attribution), btrim(r.quote)
    FROM jsonb_to_recordset(p_versions) AS r(locale text, attribution text, quote text)
  ON CONFLICT (testimonial_id, locale) DO UPDATE
     SET attribution = EXCLUDED.attribution,
         quote       = EXCLUDED.quote;
END;
$$;

COMMENT ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) IS 'The version-set half of create_testimonial and save_testimonial, which have already checked the caller is an admin. p_versions is the whole set, a JSON array of {locale, attribution, quote}, replacing what was stored: a locale it omits is removed. At least one version, each passing check_testimonial_version, else check_violation; a locale named twice, or p_versions not an array, raises 22023. Text is trimmed. Not exposed: granted to no Data API role but the service role.';

REVOKE ALL ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_testimonial_versions(p_id uuid, p_versions jsonb) TO service_role;

CREATE FUNCTION public.create_testimonial(p_versions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.testimonials DEFAULT VALUES
  RETURNING id INTO v_id;

  PERFORM public.replace_testimonial_versions(v_id, p_versions);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_testimonial(p_versions jsonb) IS 'Admin-gated create of a testimonial; returns its id. p_versions is the whole version set, as replace_testimonial_versions takes it — at least one {locale, attribution, quote}, each with both fields and no quotation marks around the quote. Who created it, and through which AI app, is stamped by the trigger. It is placed nowhere. SECURITY DEFINER because neither testimonial table carries a write grant.';

REVOKE ALL ON FUNCTION public.create_testimonial(p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_testimonial(p_versions jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_testimonial(p_versions jsonb) TO service_role;

CREATE FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  -- Written first, so an id no testimonial has is refused before any version
  -- is, and so the save is stamped.
  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.replace_testimonial_versions(p_id, p_versions);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) IS 'Admin-gated whole save of a testimonial, the editor''s: p_versions is the whole version set, as replace_testimonial_versions takes it, replacing what was stored — a locale it omits is removed. A placed testimonial may be saved; its words change wherever it is shown. Returns its id; an id no testimonial has raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_testimonial(p_id uuid, p_versions jsonb) TO service_role;

CREATE FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  PERFORM public.check_testimonial_version(p_locale, p_attribution, p_quote);

  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.testimonial_translations AS t (testimonial_id, locale, attribution, quote)
  VALUES (p_id, p_locale, btrim(p_attribution), btrim(p_quote))
  ON CONFLICT (testimonial_id, locale) DO UPDATE
     SET attribution = EXCLUDED.attribution,
         quote       = EXCLUDED.quote;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) IS 'Admin-gated partial write of one language version of a testimonial — whom it is from and the quote, replacing what that locale held, or adding the locale. No other version is touched, so two admins writing two languages never undo each other. The version is checked by check_testimonial_version (check_violation naming the locale); a malformed locale fails the table''s CHECK; an id no testimonial has raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';

REVOKE ALL ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_testimonial_version(p_id uuid, p_locale text, p_attribution text, p_quote text) TO service_role;

CREATE FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.testimonials
     SET updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.testimonial_translations
     WHERE testimonial_id = p_id AND locale = p_locale
  ) THEN
    RAISE EXCEPTION 'The testimonial has no % version', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.testimonial_translations
     WHERE testimonial_id = p_id AND locale <> p_locale
  ) THEN
    RAISE EXCEPTION 'That is the testimonial''s only language version, and a testimonial needs one'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.testimonial_translations
   WHERE testimonial_id = p_id AND locale = p_locale;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) IS 'Admin-gated removal of one language version of a testimonial; no other is touched. Refuses the testimonial''s last version (check_violation); an id no testimonial has, or a locale it has no version in, raises no_data_found. SECURITY DEFINER because neither testimonial table carries a write grant.';

REVOKE ALL ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_testimonial_version(p_id uuid, p_locale text) TO service_role;

CREATE FUNCTION public.delete_testimonial(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_spot public.home_testimonial_spot;
BEGIN
  PERFORM public.assert_admin();

  -- Locked first, so a placement cannot land between the check below and the
  -- delete; the foreign key restricts beneath it either way.
  PERFORM 1
    FROM public.testimonials
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Testimonial not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Every place a testimonial can be shown is named here, so the refusal says
  -- where it is used rather than which key it violates.
  SELECT spot INTO v_spot
    FROM public.home_testimonials
   WHERE testimonial_id = p_id;

  IF FOUND THEN
    RAISE EXCEPTION 'This testimonial is shown in the home page''s % spot, and so on About too, so it cannot be deleted. Which testimonial fills a home spot is changed by a developer.',
      CASE v_spot
        WHEN 'feature' THEN 'feature (under the hero)'
        WHEN 'safety'  THEN 'safety (beside the safety facts)'
        WHEN 'row'     THEN 'row ("What parents tell us")'
      END
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM public.testimonials WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION public.delete_testimonial(p_id uuid) IS 'Admin-gated removal of a testimonial outright, its versions with it (ON DELETE CASCADE). Refuses a testimonial shown anywhere with foreign_key_violation and a sentence naming where — today a home spot, and About through it; the foreign key from home_testimonials restricts beneath the check. An id no testimonial has raises no_data_found. SECURITY DEFINER because testimonials carries no write grant.';

REVOKE ALL ON FUNCTION public.delete_testimonial(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_testimonial(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_testimonial(p_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The public read
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.list_home_testimonials()
RETURNS TABLE(spot public.home_testimonial_spot, "position" smallint, testimonial_id uuid, versions jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT h.spot,
         h.position,
         h.testimonial_id,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object(
                     'locale', t.locale,
                     'attribution', t.attribution,
                     'quote', t.quote))
              FROM public.testimonial_translations t
             WHERE t.testimonial_id = h.testimonial_id),
           '[]'::jsonb)
    FROM public.home_testimonials h
   ORDER BY h.spot, h.position;
$$;

COMMENT ON FUNCTION public.list_home_testimonials() IS 'The home page''s and About''s testimonials: every testimonial placed in a home spot, with its spot, its position there and every language version as a JSON array of {locale, attribution, quote} (in no particular order: the reader picks theirs in the app). Crosses the boundary that the testimonial store is admin-only and anon holds no grant on it, and hands back only what a placement puts on the public pages — never an unplaced testimonial, and never who created or saved one. Ordered by spot (feature, safety, row), then position. Takes no argument and answers every caller identically.';

REVOKE ALL ON FUNCTION public.list_home_testimonials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_home_testimonials() TO anon;
GRANT EXECUTE ON FUNCTION public.list_home_testimonials() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_home_testimonials() TO service_role;

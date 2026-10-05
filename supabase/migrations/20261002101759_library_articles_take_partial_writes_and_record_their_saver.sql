-- A Library article can be written a piece at a time, and remembers who last
-- saved it and through what.
--
-- PARTIAL WRITES
--
-- save_library_article replaces the whole version set and assigns the
-- category and the cover on every call, which is right for the editor: the
-- form holds the whole article and saves it whole. An AI app working through
-- the MCP endpoint writes one language, or sets one field, at a time; sent
-- through the whole-article save, its write would carry a stale copy of
-- everything it was not changing and silently undo another admin's edit to
-- it. So three narrower writers sit beside the save, each touching exactly
-- what it names:
--
--   save_library_article_version   one (article, locale) row of the working copy
--   set_library_article_category   the working copy's category
--   set_library_article_cover      the working copy's cover
--
-- With them, a one-language write can only ever lose to another write of the
-- same language. Each writes the article row first, as the save does, so the
-- row's updated_at moves and publish_library_article's row lock orders it.
--
-- THE LAST SAVER
--
-- The working copy recorded when it was last saved and nothing about by whom.
-- Two columns now record the rest: the admin, and the OAuth client the save
-- came through (an AI app), NULL for a save in Sogverse itself. Both are
-- stamped by a trigger from the request's own claims, on every write that
-- changes the working copy, so no writer can forget them and none can supply
-- them. A token minted for an AI app by the project's OAuth server is an
-- ordinary user JWT plus a client_id claim naming the client; a first-party
-- session carries none.
--
-- The app's name lives in auth.oauth_clients, which no Data API role can
-- read, and the client chose it at registration. get_oauth_client hands an
-- admin one client's public description by id, which is how the editor
-- names the app.
--
-- Articles saved before this migration have no recorded saver: their columns
-- stay NULL until their next save, rather than guessing the author.

-- ---------------------------------------------------------------------------
-- 1. The last saver
-- ---------------------------------------------------------------------------

ALTER TABLE public.library_articles
  ADD COLUMN last_saved_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN last_saved_via uuid;

COMMENT ON COLUMN public.library_articles.last_saved_by IS
  'The admin whose write last changed the working copy, stamped from '
  'auth.uid() by stamp_library_article_saver and never supplied by a '
  'statement. NULL when that write had no signed-in caller (a server-side '
  'write under the service role, or a hand write over psql), when the account '
  'has since gone (SET NULL), and on articles last saved before the column '
  'existed.';

COMMENT ON COLUMN public.library_articles.last_saved_via IS
  'The OAuth client — an AI app connected through the MCP endpoint — that '
  'last_saved_by''s write came through: auth.oauth_clients.id, read from the '
  'token''s client_id claim by stamp_library_article_saver. NULL for a write '
  'made in Sogverse itself, and whenever last_saved_by is NULL. No foreign '
  'key: the client belongs to Supabase Auth, and the record that a save came '
  'through an app outlives it. Deleting a client only marks it deleted, so '
  'get_oauth_client still names it; a client removed outright names nothing.';

CREATE FUNCTION public.stamp_library_article_saver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.last_saved_by  := auth.uid();
  NEW.last_saved_via := NULL;

  -- A client is recorded only beside a saver: with no signed-in caller there
  -- is no token whose claim could name one.
  IF NEW.last_saved_by IS NOT NULL THEN
    NEW.last_saved_via := (auth.jwt() ->> 'client_id')::uuid;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_library_article_saver() IS
  'BEFORE INSERT, and BEFORE UPDATE of the working copy''s own content '
  '(category, cover_image_id, updated_at), on library_articles: stamps '
  'last_saved_by from auth.uid() and last_saved_via from the token''s '
  'client_id claim, overwriting whatever the statement said, so it is both '
  'columns'' only writer. Every Library writer touches one of those columns, '
  'and so does the image catalogue''s removal of a cover entry. The column '
  'list keeps a profile deletion''s SET NULL on author_id or last_saved_by '
  'from being re-stamped as a save by whoever deleted the account.';

REVOKE EXECUTE ON FUNCTION public.stamp_library_article_saver() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.stamp_library_article_saver() TO service_role;

CREATE TRIGGER trg_library_articles_stamp_saver
  BEFORE INSERT OR UPDATE OF category, cover_image_id, updated_at
  ON public.library_articles
  FOR EACH ROW EXECUTE FUNCTION public.stamp_library_article_saver();

-- The save time takes the stamp's column list too. On every column, a profile
-- deletion's SET NULL on author_id or last_saved_by would move it, showing a
-- save nobody made at the moment an account went.
DROP TRIGGER library_articles_updated_at ON public.library_articles;

CREATE TRIGGER library_articles_updated_at
  BEFORE UPDATE OF category, cover_image_id, updated_at
  ON public.library_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.library_articles.updated_at IS
  'When the working copy was last saved, its versions included, maintained by '
  'the library_articles_updated_at trigger on an update of category, '
  'cover_image_id or updated_at: every Library writer names one of them, and '
  'so do the catalogue''s replace and removal, which move the cover. '
  'Publishing does not touch it, and neither does a profile deletion''s SET '
  'NULL on author_id or last_saved_by. Who saved it, and through which app, '
  'are last_saved_by and last_saved_via.';

COMMENT ON TABLE public.library_articles IS
  'The WORKING COPY of each Library article — what an admin is editing, which '
  'may be saved incomplete: the category and cover here, and the text per '
  'language in library_article_translations. The public never reads this '
  'table: what is live is the article''s row in library_article_publications, '
  'copied from this one by publish_library_article, so saving here never '
  'changes the live article. The id is the article''s URL. Admin-only end to '
  'end: SELECT for authenticated behind an admin policy, nothing for anon, '
  'and no write grant at all — the only writers are create_library_article, '
  'save_library_article, the partial writers save_library_article_version, '
  'set_library_article_category and set_library_article_cover, and the '
  'catalogue''s repoint_library_covers. No delete: an article that has to '
  'come down is unpublished.';

COMMENT ON TABLE public.library_article_translations IS
  'One language version of a Library article''s WORKING COPY — what an admin '
  'is editing in that locale, which may be saved incomplete. Any set of '
  'locales, at least one per article: save_library_article refuses an empty '
  'set, and nothing else removes a version. The public never reads this '
  'table: publishing copies the complete versions to '
  'library_article_publication_translations. Admin-only end to end: SELECT '
  'for authenticated behind an admin policy, nothing for anon, and no write '
  'grant — the writers are save_library_article, which replaces the whole '
  'set, and save_library_article_version, which writes one version.';

-- ---------------------------------------------------------------------------
-- 2. The partial writers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.save_library_article_version(
  p_id      uuid,
  p_locale  text,
  p_title   text,
  p_summary text,
  p_body    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  -- The admin list names an article by a title, so every version has one.
  IF btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(p_locale, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Written first, so an id no article has is refused before the version is,
  -- the row's updated_at moves (its trigger stamps it, and the saver with it),
  -- and the row lock publish_library_article takes orders this write wholly
  -- before or after a publish. Nothing else on the row changes.
  UPDATE public.library_articles SET updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.library_article_translations AS t
         (article_id, locale, title, summary, body)
  VALUES (p_id,
          p_locale,
          btrim(p_title),
          btrim(COALESCE(p_summary, '')),
          btrim(COALESCE(p_body, '')))
  ON CONFLICT (article_id, locale) DO UPDATE
     SET title   = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body    = EXCLUDED.body;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_library_article_version(uuid, text, text, text, text) IS
  'Admin-gated save of ONE language version of a Library article''s WORKING '
  'COPY; returns the article id. Writes the (article, locale) row as sent, '
  'creating it when the language is new, and touches no other version, nor '
  'the category or cover — so two writes of different languages can never '
  'undo each other. Never touches the published copy. A blank title raises '
  'check_violation naming the locale; a NULL summary or body is saved empty. '
  'Text is trimmed. The locale is checked by the table''s own format CHECK. '
  'An id no article has raises no_data_found. SECURITY DEFINER because '
  'neither working table carries a write grant.';

REVOKE EXECUTE ON FUNCTION public.save_library_article_version(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_library_article_version(uuid, text, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_library_article_version(uuid, text, text, text, text) TO service_role;

CREATE FUNCTION public.set_library_article_category(
  p_id       uuid,
  p_category public.library_article_category DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.library_articles SET category = p_category
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.set_library_article_category(uuid, public.library_article_category) IS
  'Admin-gated write of a Library article''s working-copy category alone; '
  'returns the article id. NULL clears it, which publishing then refuses. '
  'Touches nothing else, and never the published copy. An id no article has '
  'raises no_data_found. SECURITY DEFINER because the working copy carries no '
  'write grant. p_category defaults NULL because codegen cannot express an '
  'explicit null for a non-defaulted argument.';

REVOKE EXECUTE ON FUNCTION public.set_library_article_category(uuid, public.library_article_category) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_library_article_category(uuid, public.library_article_category) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_library_article_category(uuid, public.library_article_category) TO service_role;

CREATE FUNCTION public.set_library_article_cover(
  p_id             uuid,
  p_cover_image_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  -- The cover-path trigger derives the path and refuses an entry that is
  -- gone or not a Library cover.
  UPDATE public.library_articles SET cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.set_library_article_cover(uuid, uuid) IS
  'Admin-gated write of a Library article''s working-copy cover alone; '
  'returns the article id. The cover is a catalogue entry id, and NULL clears '
  'it; the cover-path trigger derives the path and refuses an entry that is '
  'gone (23503) or not a library_cover (23514). Touches nothing else, and '
  'never the published copy. An id no article has raises no_data_found. '
  'SECURITY DEFINER because the working copy carries no write grant. '
  'p_cover_image_id defaults NULL because codegen cannot express an explicit '
  'null for a non-defaulted argument.';

REVOKE EXECUTE ON FUNCTION public.set_library_article_cover(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_library_article_cover(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_library_article_cover(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Naming the app a save came through
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_oauth_client(p_id uuid)
RETURNS TABLE (
  id          uuid,
  client_name text,
  client_uri  text,
  logo_uri    text,
  created_at  timestamptz,
  deleted_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT c.id, c.client_name, c.client_uri, c.logo_uri, c.created_at, c.deleted_at
    FROM auth.oauth_clients c
   WHERE c.id = p_id;
END;
$$;

COMMENT ON FUNCTION public.get_oauth_client(uuid) IS
  'Admin-gated read of one OAuth client registered with the project''s '
  'Supabase Auth OAuth server — an AI app that connects to the MCP endpoint — '
  'by its id, the client_id claim its tokens carry: its public description '
  'only (name, homepage, logo, when registered, when deleted), never its '
  'secret or redirect URIs. Every field but the id is what the registrant '
  'typed. A soft-deleted client is still returned, with deleted_at set; an id '
  'no client has returns no row. SECURITY DEFINER because auth.oauth_clients '
  'carries no grant for any Data API role, which is the boundary it crosses.';

REVOKE EXECUTE ON FUNCTION public.get_oauth_client(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_oauth_client(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_oauth_client(uuid) TO service_role;

-- A Library article has a version per language.
--
-- An article's title, summary and body are written per site locale, by hand,
-- in the editor's language tabs; its category and cover stay one per article.
-- Both copies of an article are per-language: the working copy an admin edits
-- and the published copy readers see. One Publish copies every complete
-- version at once — complete meaning a title, a summary and a body — and
-- unpublishing takes them all down. Readers fall back from their own locale to
-- English and then to the first version written, in the app.
--
-- THE SHAPE: TWO VERSION TABLES BESIDE THE TWO COPIES
--
-- The team profile's precedent: the per-language text moves to a child table
-- keyed (article_id, locale), and the parent keeps what is shared. Each copy
-- gets its own:
--
--   library_articles                        → library_article_translations
--   library_article_publications            → library_article_publication_translations
--
-- So the split that keeps a draft out of public reach is unchanged: anon reads
-- the published versions, which hold only what publishing copied, and holds no
-- grant on the working ones. A published version is complete by CHECK, as the
-- published copy's text columns were; a working version needs only its title,
-- as the working copy did, because the admin list names an article by it.
--
-- Every existing article is English, so its text becomes its English version
-- in both copies, and the dates (created_at, updated_at, published_at,
-- first_published_at) stay on the rows that already carry them, untouched.

-- ---------------------------------------------------------------------------
-- 1. The working copy's versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.library_article_translations (
  article_id  uuid NOT NULL
                REFERENCES public.library_articles(id) ON DELETE CASCADE,
  locale      text NOT NULL,
  title       text NOT NULL,
  summary     text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  body_md5    text GENERATED ALWAYS AS (md5(body)) STORED,
  is_complete boolean GENERATED ALWAYS AS (
                btrim(title) <> '' AND btrim(summary) <> '' AND btrim(body) <> ''
              ) STORED,

  PRIMARY KEY (article_id, locale),

  CONSTRAINT chk_library_article_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}$'),
  -- The one field a version must carry: the admin list names each article by
  -- one of its titles.
  CONSTRAINT chk_library_article_translations_title_present
    CHECK (btrim(title) <> '')
);

COMMENT ON TABLE public.library_article_translations IS
  'One language version of a Library article''s WORKING COPY — what an admin '
  'is editing in that locale, which may be saved incomplete. Any set of '
  'locales, at least one per article (save_library_article enforces it). The '
  'public never reads this table: publishing copies the complete versions to '
  'library_article_publication_translations. Admin-only end to end: SELECT for '
  'authenticated behind an admin policy, nothing for anon, and no write grant '
  '— save_library_article, which replaces the whole set, is the only writer.';

COMMENT ON COLUMN public.library_article_translations.locale IS
  'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. '
  'Not a spoken language.';

COMMENT ON COLUMN public.library_article_translations.title IS
  'The title in this language, trimmed. The one field a version must carry.';

COMMENT ON COLUMN public.library_article_translations.summary IS
  'The standfirst shown under the title and on the index card: plain text, '
  'trimmed, and the empty string while unwritten.';

COMMENT ON COLUMN public.library_article_translations.body IS
  'The authored markdown in this language, trimmed, and the empty string while '
  'unwritten. The article page counts its reading time from it.';

COMMENT ON COLUMN public.library_article_translations.body_md5 IS
  'md5 of body, generated, so the admin list can tell whether a version differs '
  'from its published one without reading either body.';

COMMENT ON COLUMN public.library_article_translations.is_complete IS
  'Generated: title, summary and body all written. A complete version is one '
  'publishing copies; an incomplete one stays in the working copy alone. The '
  'one definition of complete, which publish_library_article reads.';

ALTER TABLE public.library_article_translations ENABLE ROW LEVEL SECURITY;

-- One SELECT policy and no write policy: there is no write grant for one to
-- authorize, because the only writer is SECURITY DEFINER.
CREATE POLICY admins_read_library_article_translations
  ON public.library_article_translations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.library_article_translations TO authenticated;
GRANT ALL    ON TABLE public.library_article_translations TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The published copy's versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.library_article_publication_translations (
  article_id  uuid NOT NULL
                REFERENCES public.library_article_publications(article_id) ON DELETE CASCADE,
  locale      text NOT NULL,
  title       text NOT NULL,
  summary     text NOT NULL,
  body        text NOT NULL,
  body_md5    text GENERATED ALWAYS AS (md5(body)) STORED,

  PRIMARY KEY (article_id, locale),

  CONSTRAINT chk_library_article_publication_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}$'),
  -- A published version is complete. These are the backstop behind
  -- publish_library_article copying only complete versions, so a row arriving
  -- any other way still cannot put a blank on a public page.
  CONSTRAINT chk_library_article_publication_translations_title_present
    CHECK (btrim(title) <> ''),
  CONSTRAINT chk_library_article_publication_translations_summary_present
    CHECK (btrim(summary) <> ''),
  CONSTRAINT chk_library_article_publication_translations_body_present
    CHECK (btrim(body) <> '')
);

COMMENT ON TABLE public.library_article_publication_translations IS
  'One language version of a live Library article — what readers of that '
  'language see. publish_library_article replaces an article''s whole set with '
  'the working copy''s complete versions, so a live article has at least one; '
  'unpublishing deletes the publication and these with it (CASCADE). Every text '
  'field is complete by CHECK. Readable by anon and authenticated alike, every '
  'row; no write grant for either. Readers pick a version in the app: their '
  'locale, then English, then the first written.';

COMMENT ON COLUMN public.library_article_publication_translations.locale IS
  'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. '
  'Not a spoken language.';

COMMENT ON COLUMN public.library_article_publication_translations.body_md5 IS
  'md5 of body, generated — compared with the working version''s own to tell '
  'whether it has unpublished changes, without reading either body.';

ALTER TABLE public.library_article_publication_translations ENABLE ROW LEVEL SECURITY;

-- Everything published is public, so the predicate is TRUE — the table holds
-- nothing else. Named to both roles explicitly, never left to PUBLIC.
CREATE POLICY everyone_reads_library_article_publication_translations
  ON public.library_article_publication_translations
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.library_article_publication_translations TO anon;
GRANT SELECT ON TABLE public.library_article_publication_translations TO authenticated;
GRANT ALL    ON TABLE public.library_article_publication_translations TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Every existing article becomes its English version
-- ---------------------------------------------------------------------------
-- Inserts into the new tables only, so no trigger on the copies fires and
-- every date stays as it was.

INSERT INTO public.library_article_translations (article_id, locale, title, summary, body)
SELECT id, 'en', title, summary, body
  FROM public.library_articles;

INSERT INTO public.library_article_publication_translations (article_id, locale, title, summary, body)
SELECT article_id, 'en', title, summary, body
  FROM public.library_article_publications;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.library_articles)
     <> (SELECT count(*) FROM public.library_article_translations) THEN
    RAISE EXCEPTION 'Every working copy should have become exactly one English version';
  END IF;
  IF (SELECT count(*) FROM public.library_article_publications)
     <> (SELECT count(*) FROM public.library_article_publication_translations) THEN
    RAISE EXCEPTION 'Every published copy should have become exactly one English version';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.library_articles a
      JOIN public.library_article_translations t ON t.article_id = a.id
     WHERE (t.title, t.summary, t.body) IS DISTINCT FROM (a.title, a.summary, a.body)
  ) OR EXISTS (
    SELECT 1
      FROM public.library_article_publications p
      JOIN public.library_article_publication_translations t ON t.article_id = p.article_id
     WHERE (t.title, t.summary, t.body) IS DISTINCT FROM (p.title, p.summary, p.body)
  ) THEN
    RAISE EXCEPTION 'An English version differs from the text it was copied from';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The copies keep only what is shared
-- ---------------------------------------------------------------------------
-- The generated digest goes first: it depends on the body.

ALTER TABLE public.library_articles
  DROP COLUMN body_md5,
  DROP COLUMN title,
  DROP COLUMN summary,
  DROP COLUMN body;

ALTER TABLE public.library_article_publications
  DROP COLUMN body_md5,
  DROP COLUMN title,
  DROP COLUMN summary,
  DROP COLUMN body;

COMMENT ON TABLE public.library_articles IS
  'The WORKING COPY of each Library article — what an admin is editing, which '
  'may be saved incomplete: the category and cover here, and the text per '
  'language in library_article_translations. The public never reads this '
  'table: what is live is the article''s row in library_article_publications, '
  'copied from this one by publish_library_article, so saving here never '
  'changes the live article. The id is the article''s URL. Admin-only end to '
  'end: SELECT for authenticated behind an admin policy, nothing for anon, and '
  'no write grant at all — the only writers are create_library_article, '
  'save_library_article and the catalogue''s repoint_library_covers. No '
  'delete: an article that has to come down is unpublished.';

COMMENT ON COLUMN public.library_articles.updated_at IS
  'When the working copy was last saved, its versions included, maintained by '
  'the library_articles_updated_at trigger: every save writes this row. '
  'Publishing does not touch it; a catalogue replace that moves the cover '
  'does, since it writes the row.';

COMMENT ON TABLE public.library_article_publications IS
  'The PUBLISHED COPY of each live Library article: its category and cover '
  'here, and its text per language in library_article_publication_translations. '
  'A row''s existence is the article being live: publish_library_article copies '
  'the working copy over it and unpublish_library_article deletes it, its '
  'versions with it. The category is complete by NOT NULL and every version by '
  'CHECK, so nothing on a public page is ever blank; the cover is optional. '
  'Readable by anon and authenticated alike, every row; no write grant for '
  'either — publish and unpublish are the only writers, and the catalogue''s '
  'repoint_library_covers the only other. Holding no draft column is what '
  'keeps a draft out of public reach, rather than a policy that has to filter '
  'one.';

-- ---------------------------------------------------------------------------
-- 5. The writers
-- ---------------------------------------------------------------------------
-- Guard-first on assert_admin(), SECURITY DEFINER with an empty search_path,
-- and deliberately not STRICT. The two writers of the working copy change
-- signature, so they are dropped and created again.

DROP FUNCTION public.create_library_article(text, text, text, public.library_article_category, uuid);
DROP FUNCTION public.save_library_article(uuid, text, text, text, public.library_article_category, uuid);

CREATE FUNCTION public.save_library_article(
  p_id             uuid,
  p_versions       jsonb,
  p_category       public.library_article_category DEFAULT NULL,
  p_cover_image_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_untitled text;
BEGIN
  PERFORM public.assert_admin();

  IF p_versions IS NULL OR jsonb_typeof(p_versions) <> 'array' THEN
    RAISE EXCEPTION 'p_versions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- The admin list names an article by a title, so an article has at least
  -- one version and every version has its title.
  IF jsonb_array_length(p_versions) = 0 THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.locale INTO v_untitled
    FROM jsonb_to_recordset(p_versions) AS r(locale text, title text)
   WHERE btrim(COALESCE(r.title, '')) = ''
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'The % version needs a title', COALESCE(v_untitled, 'unnamed')
      USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT count(DISTINCT r.locale) <> count(*)
        FROM jsonb_to_recordset(p_versions) AS r(locale text)) THEN
    RAISE EXCEPTION 'Each language may have one version'
      USING ERRCODE = '22023';
  END IF;

  -- Every shared column is assigned on every call, so an omitted optional
  -- argument clears its field — which is how one is cleared. Written first, so
  -- an id no article has is refused before any version is, and so the row's
  -- updated_at moves on every save.
  UPDATE public.library_articles SET
    category       = p_category,
    cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The version set is replaced whole: a locale the save no longer names is
  -- gone, and every named one is written as sent.
  DELETE FROM public.library_article_translations t
   WHERE t.article_id = p_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_versions) e
        WHERE e->>'locale' = t.locale);

  INSERT INTO public.library_article_translations AS t
         (article_id, locale, title, summary, body)
  SELECT p_id,
         r.locale,
         btrim(r.title),
         btrim(COALESCE(r.summary, '')),
         btrim(COALESCE(r.body, ''))
    FROM jsonb_to_recordset(p_versions)
      AS r(locale text, title text, summary text, body text)
  ON CONFLICT (article_id, locale) DO UPDATE
     SET title   = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body    = EXCLUDED.body;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_library_article(uuid, jsonb, public.library_article_category, uuid) IS
  'Admin-gated save of a Library article''s WORKING COPY; returns its id. It '
  'never touches the published copy, so the live article is unchanged until '
  'publish_library_article is called. p_versions is the whole version set, a '
  'JSON array of {locale, title, summary, body}, replacing what was stored: a '
  'locale it omits is removed. At least one version, each with a title, else '
  'check_violation naming the locale; a locale named twice, or p_versions not '
  'an array, raises 22023. Text is trimmed. The category and cover are '
  'assigned on every call — an omitted one clears that field, which is the '
  'only way to clear one. The cover is a catalogue entry id, and the '
  'cover-path trigger refuses one that is gone or not a library cover. An id '
  'no article has raises no_data_found rather than silently saving nothing. '
  'SECURITY DEFINER because neither working table carries a write grant.';

REVOKE EXECUTE ON FUNCTION public.save_library_article(uuid, jsonb, public.library_article_category, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_library_article(uuid, jsonb, public.library_article_category, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_library_article(uuid, jsonb, public.library_article_category, uuid) TO service_role;

CREATE FUNCTION public.create_library_article(
  p_versions       jsonb,
  p_category       public.library_article_category DEFAULT NULL,
  p_cover_image_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  INSERT INTO public.library_articles (author_id)
  VALUES (auth.uid())
  RETURNING id INTO v_id;

  -- The save's own validation and writes, so a create and a save can never
  -- disagree about what an article may hold. A refusal there aborts this
  -- whole call, the row above included.
  PERFORM public.save_library_article(v_id, p_versions, p_category, p_cover_image_id);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_library_article(jsonb, public.library_article_category, uuid) IS
  'Admin-gated create of a Library article''s working copy; returns its id, '
  'which is the article''s URL. Stamps the caller as author, then writes the '
  'versions, category and cover through save_library_article, whose rules and '
  'refusals are this function''s: at least one version, each with a title. '
  'Nothing is published. SECURITY DEFINER because the working tables carry no '
  'write grant. The optional parameters default NULL because codegen cannot '
  'express an explicit null for a non-defaulted argument.';

REVOKE EXECUTE ON FUNCTION public.create_library_article(jsonb, public.library_article_category, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_library_article(jsonb, public.library_article_category, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_library_article(jsonb, public.library_article_category, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_library_article(p_id uuid) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_article public.library_articles;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_admin();

  -- Locked, so a save racing this publish (which writes this row first) lands
  -- wholly before or wholly after the copy rather than half in it.
  SELECT * INTO v_article
    FROM public.library_articles
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A cover is not among these: an article may go live without one. An
  -- incomplete version is not a refusal either: it stays in the working copy.
  IF v_article.category IS NULL THEN
    v_missing := array_append(v_missing, 'a category');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.library_article_translations
                  WHERE article_id = p_id AND is_complete) THEN
    v_missing := array_append(v_missing, 'a language version with a title, a summary and a body');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'The article cannot be published without %',
      array_to_string(v_missing, ' or ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The link is copied and the path is not: the cover-path trigger derives
  -- the published copy's own.
  INSERT INTO public.library_article_publications (
    article_id, category, cover_image_id, published_at, first_published_at
  )
  VALUES (
    v_article.id, v_article.category, v_article.cover_image_id, now(), now()
  )
  ON CONFLICT (article_id) DO UPDATE SET
    category       = EXCLUDED.category,
    cover_image_id = EXCLUDED.cover_image_id,
    published_at   = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live article keeps the date it first went live.

  -- The live version set becomes the complete working versions, whole: a
  -- version no longer complete, or no longer there, leaves the live article.
  DELETE FROM public.library_article_publication_translations
   WHERE article_id = p_id;

  INSERT INTO public.library_article_publication_translations
         (article_id, locale, title, summary, body)
  SELECT article_id, locale, title, summary, body
    FROM public.library_article_translations
   WHERE article_id = p_id
     AND is_complete;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.publish_library_article(uuid) IS
  'Admin-gated publish: copies the article''s working copy over its published '
  'copy, making it live or replacing the live version — the category, the '
  'cover and every complete language version (title, summary and body all '
  'written), at once; the live version set becomes exactly those. An '
  'incomplete version stays in the working copy. Refuses with '
  'check_violation, naming everything missing in one sentence, an article '
  'with no complete version or no category — the published tables'' CHECKs '
  'are the backstop. A cover is optional. A republish moves published_at and '
  'keeps first_published_at. The working copy is locked for the copy, so a '
  'concurrent save lands wholly before or after it. An id no article has '
  'raises no_data_found. SECURITY DEFINER because no Library table carries a '
  'write grant.';

COMMENT ON FUNCTION public.unpublish_library_article(uuid) IS
  'Admin-gated unpublish: deletes the article''s published copy, every '
  'language version with it, taking it off every public page, and leaves the '
  'working copy exactly as it was. It exists so a mistake can be taken down; '
  'there is no delete of the article itself. Unpublishing an article that is '
  'not live is a no-op, since the state asked for already holds; an id no '
  'article has raises no_data_found. Publishing again afterwards starts a new '
  'first_published_at.';

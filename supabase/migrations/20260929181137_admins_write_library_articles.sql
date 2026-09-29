-- Admins write the Library's articles, and the public reads what they publish.
--
-- The Library is a public set of articles for parents. An admin writes an
-- article in five fields — title, summary, markdown body, cover picture and one
-- of five categories — and publishes it when it is ready. Everything else a
-- page shows is derived: the article page counts the reading time from the
-- body, and the dates come from publishing.
--
-- TWO COPIES, BECAUSE PUBLISHING IS INDEPENDENT OF EDITING
--
-- An admin can publish an article, go on editing it, save those edits without
-- them going live, and publish again when they are ready. So an article has a
-- WORKING COPY (`library_articles`), which is admin-only and may be saved
-- incomplete, and at most one PUBLISHED COPY (`library_article_publications`),
-- which is what the public reads. The published copy's existence IS the
-- article being live: publishing copies the working copy over it, and
-- unpublishing deletes it. The split is what guarantees the public can never
-- read a draft — there is no draft column in the table it can read, rather
-- than a policy that has to remember to filter one out.
--
-- A published copy is COMPLETE, enforced by the table's own CHECKs: every text
-- field non-blank and a category. A cover is optional even on a live article,
-- which then shows the same NO IMAGE placeholder a product without a picture
-- does. The working copy has to hold only a title, so a list of drafts never
-- shows an unnamed row.
--
-- The article's URL is its id. There is no slug.
--
-- Writes are the invoice-customers posture: no table write grant for any Data
-- API role, and admin-guarded SECURITY DEFINER functions as the only way in:
-- four for the articles themselves, and one for the image catalogue's replace
-- to move covers with. There is no delete: an article is added, edited, published and, when a
-- mistake has to come down, unpublished.
--
-- COVERS
--
-- A cover is an entry in the shared image catalogue (`catalogue_images`) of
-- purpose 'library_cover', exactly as a product's picture is an entry of
-- purpose 'product'; its object lives in the `library-covers` bucket.
-- Both copies of an article point at an entry with `cover_image_id`, and each
-- carries a `cover_path` that a trigger derives from that entry on every
-- write — the products pattern, so the public read of the published copy gets
-- a servable path without reading the admin-only catalogue. The trigger is
-- that column's only writer, and it refuses an entry of any other purpose.
--
-- Because both copies hold a link rather than a path, the catalogue's replace
-- (a repoint of every link from the old entry to the new) reaches a live
-- article without a republish, and removing an entry nulls its covers, live
-- ones included, through the foreign key.

-- ---------------------------------------------------------------------------
-- 1. The categories
-- ---------------------------------------------------------------------------

CREATE TYPE public.library_article_category AS ENUM (
  'online_safety',
  'screen_time',
  'learning',
  'games_explained',
  'for_schools'
);

COMMENT ON TYPE public.library_article_category IS
  'The Library''s five categories; every published article is in exactly one. '
  'The app uses these values as they are, in the index''s ?category= links and '
  'as the keys of its category labels, so there is one spelling everywhere. '
  'There is no news category on purpose: the Library holds what a parent can still use '
  'next year, and a dated announcement is not that.';

-- ---------------------------------------------------------------------------
-- 2. The cover path, derived from the catalogue entry
-- ---------------------------------------------------------------------------
-- One trigger function for both copies: they name the two columns alike. It
-- is the products trigger's twin, with the Library's purpose.

CREATE FUNCTION public.apply_library_cover_path() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
DECLARE
  v_path    text;
  v_purpose public.catalogue_image_purpose;
BEGIN
  IF NEW.cover_image_id IS NOT NULL THEN
    SELECT path, purpose INTO v_path, v_purpose
      FROM public.catalogue_images
     WHERE id = NEW.cover_image_id;

    -- This runs before the foreign key, which is checked at statement end, so
    -- it makes the key's own claim first and with the key's own SQLSTATE: the
    -- reachable cause is an entry another admin removed after this one was
    -- chosen. Saving with no cover instead would be the worst answer to that.
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'That picture is no longer in the catalogue (catalogue_images row %)', NEW.cover_image_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- An entry of another purpose lives in another bucket and was cropped for
    -- another frame, so a cover showing it would paint a path its readers
    -- resolve against the wrong bucket. The cover picker offers only Library
    -- cover entries; this refuses loudly the state that picker cannot produce.
    IF v_purpose <> 'library_cover' THEN
      RAISE EXCEPTION 'That picture is a % picture, and a Library cover has to be a library_cover one (catalogue_images row %)', v_purpose, NEW.cover_image_id
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.cover_path := v_path;
  ELSE
    -- No entry, no cover, whatever the statement said about cover_path.
    NEW.cover_path := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_library_cover_path() IS
  'BEFORE INSERT OR UPDATE on library_articles and on '
  'library_article_publications: cover_path is derived from the linked '
  'catalogue_images entry, and is NULL whenever cover_image_id is. No branch '
  'keeps a statement-supplied path, so this function is the column''s only '
  'writer on both tables, and the triggers carry no column list so no '
  'statement can name cover_path and win. Refuses an entry that is gone '
  '(23503) or whose purpose is not library_cover (23514): its object lives '
  'in another bucket.';

REVOKE EXECUTE ON FUNCTION public.apply_library_cover_path() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_library_cover_path() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The working copy
-- ---------------------------------------------------------------------------

CREATE TABLE public.library_articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category        public.library_article_category,
  title           text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  cover_image_id  uuid REFERENCES public.catalogue_images(id) ON DELETE SET NULL,
  cover_path      text,
  body_md5        text GENERATED ALWAYS AS (md5(body)) STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- The one field a draft must carry: the admin list names each row by it.
  CONSTRAINT chk_library_articles_title_present
    CHECK (btrim(title) <> '')
);

-- The catalogue's replace and remove find an entry's covers by this column.
CREATE INDEX idx_library_articles_cover_image_id
  ON public.library_articles (cover_image_id);

COMMENT ON TABLE public.library_articles IS
  'The WORKING COPY of each Library article — what an admin is editing, which '
  'may be saved incomplete. The public never reads this table: what is live is '
  'the article''s row in library_article_publications, copied from this one by '
  'publish_library_article, so saving here never changes the live article. '
  'The id is the article''s URL. Admin-only end to end: SELECT for '
  'authenticated behind an admin policy, nothing for anon, and no write grant '
  'at all — the only writers are create_library_article, '
  'save_library_article and the catalogue''s repoint_library_covers. No delete: an article that has to come down is '
  'unpublished.';

COMMENT ON COLUMN public.library_articles.author_id IS
  'The admin who created the article, stamped from auth.uid() by '
  'create_library_article and never changed. Kept as a record and shown '
  'nowhere. SET NULL rather than CASCADE when that account goes, because an '
  'article outlives the account that wrote it.';

COMMENT ON COLUMN public.library_articles.category IS
  'One of the five categories, or NULL while a draft has none — publishing '
  'refuses a draft without one.';

COMMENT ON COLUMN public.library_articles.title IS
  'The title, trimmed. The one field a draft must carry, because the admin '
  'list names every article by it.';

COMMENT ON COLUMN public.library_articles.summary IS
  'The standfirst shown under the title and on the index card: plain text, '
  'trimmed, and the empty string while a draft has none.';

COMMENT ON COLUMN public.library_articles.body IS
  'The article''s authored markdown, trimmed, and the empty string while a '
  'draft has none. The article page counts its reading time from it; no '
  'reading time is stored.';

COMMENT ON COLUMN public.library_articles.cover_image_id IS
  'The cover: a library_cover entry in the shared image catalogue, or NULL '
  'for none. SET NULL when the entry is removed from the catalogue; moved to '
  'the new entry by the catalogue''s replace (repoint_library_covers).';

COMMENT ON COLUMN public.library_articles.cover_path IS
  'The cover''s object name in the library-covers bucket, derived from '
  'cover_image_id by apply_library_cover_path and never written by anything '
  'else. NULL exactly when cover_image_id is.';

COMMENT ON COLUMN public.library_articles.body_md5 IS
  'md5 of body, generated. It exists so the admin list can tell whether the '
  'working copy differs from the published one without reading either body: '
  'it compares this with the publication''s own body_md5 beside the four short '
  'fields.';

COMMENT ON COLUMN public.library_articles.updated_at IS
  'When the working copy was last saved, maintained by the '
  'library_articles_updated_at trigger. Publishing does not touch it; a '
  'catalogue replace that moves the cover does, since it writes the row.';

ALTER TABLE public.library_articles ENABLE ROW LEVEL SECURITY;

-- One SELECT policy and no write policy, because there is no write grant for a
-- write policy to authorize: both writers are SECURITY DEFINER.
CREATE POLICY admins_read_library_articles
  ON public.library_articles
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.library_articles TO authenticated;
GRANT ALL    ON TABLE public.library_articles TO service_role;

CREATE TRIGGER library_articles_updated_at
  BEFORE UPDATE ON public.library_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_library_articles_apply_cover_path
  BEFORE INSERT OR UPDATE ON public.library_articles
  FOR EACH ROW EXECUTE FUNCTION public.apply_library_cover_path();

-- ---------------------------------------------------------------------------
-- 4. The published copy
-- ---------------------------------------------------------------------------

CREATE TABLE public.library_article_publications (
  article_id          uuid PRIMARY KEY
                        REFERENCES public.library_articles(id) ON DELETE CASCADE,
  category            public.library_article_category NOT NULL,
  title               text NOT NULL,
  summary             text NOT NULL,
  body                text NOT NULL,
  cover_image_id      uuid REFERENCES public.catalogue_images(id) ON DELETE SET NULL,
  cover_path          text,
  body_md5            text GENERATED ALWAYS AS (md5(body)) STORED,
  published_at        timestamptz NOT NULL,
  first_published_at  timestamptz NOT NULL,

  -- A published article is complete. These are the backstop behind
  -- publish_library_article's own readable refusal, so a row arriving any
  -- other way still cannot put a blank on a public page.
  CONSTRAINT chk_library_article_publications_title_present
    CHECK (btrim(title) <> ''),
  CONSTRAINT chk_library_article_publications_summary_present
    CHECK (btrim(summary) <> ''),
  CONSTRAINT chk_library_article_publications_body_present
    CHECK (btrim(body) <> ''),
  CONSTRAINT chk_library_article_publications_first_not_after_latest
    CHECK (first_published_at <= published_at)
);

CREATE INDEX idx_library_article_publications_first_published
  ON public.library_article_publications (first_published_at DESC, article_id);

CREATE INDEX idx_library_article_publications_cover_image_id
  ON public.library_article_publications (cover_image_id);

CREATE TRIGGER trg_library_article_publications_apply_cover_path
  BEFORE INSERT OR UPDATE ON public.library_article_publications
  FOR EACH ROW EXECUTE FUNCTION public.apply_library_cover_path();

COMMENT ON TABLE public.library_article_publications IS
  'The PUBLISHED COPY of each live Library article — the public Library''s '
  'whole source. A row''s existence is the article being live: '
  'publish_library_article copies the working copy (library_articles) over it '
  'and unpublish_library_article deletes it. Every text field and the '
  'category are complete by CHECK, so nothing on a public page is ever blank; '
  'the cover is optional. Readable by anon and authenticated alike, every '
  'row; no write grant for either — publish and unpublish are the only '
  'writers, and the catalogue''s repoint_library_covers the only other. '
  'Holding no draft column is what keeps a draft out of public reach, rather '
  'than a policy that has to filter one.';

COMMENT ON COLUMN public.library_article_publications.article_id IS
  'The article, and its URL. CASCADE from the working copy, which is never '
  'deleted in practice: there is no delete.';

COMMENT ON COLUMN public.library_article_publications.cover_image_id IS
  'The live cover: a library_cover entry in the shared image catalogue, '
  'copied from the working copy by publishing, or NULL for none. The '
  'catalogue''s replace moves it to the new entry without a republish, and '
  'removing the entry nulls it (SET NULL).';

COMMENT ON COLUMN public.library_article_publications.cover_path IS
  'The live cover''s object name in the library-covers bucket, derived from '
  'cover_image_id by apply_library_cover_path — what the public pages paint, '
  'readable without reading the admin-only catalogue. NULL exactly when '
  'cover_image_id is.';

COMMENT ON COLUMN public.library_article_publications.body_md5 IS
  'md5 of body, generated — compared with the working copy''s own to tell '
  'whether it has unpublished changes, without reading either body.';

COMMENT ON COLUMN public.library_article_publications.published_at IS
  'When the version now live was published. Every publish moves it.';

COMMENT ON COLUMN public.library_article_publications.first_published_at IS
  'When the article went live, kept by every republish while it stays live — '
  'the date the article page shows, which a later edit does not move. An '
  'unpublish deletes the row and takes the date with it, so publishing again '
  'after taking a mistake down starts a new one.';

ALTER TABLE public.library_article_publications ENABLE ROW LEVEL SECURITY;

-- Everything published is public, so the predicate is TRUE — the table holds
-- nothing else. Named to both roles explicitly, never left to PUBLIC.
CREATE POLICY everyone_reads_library_article_publications
  ON public.library_article_publications
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.library_article_publications TO anon;
GRANT SELECT ON TABLE public.library_article_publications TO authenticated;
GRANT ALL    ON TABLE public.library_article_publications TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The writers
-- ---------------------------------------------------------------------------
-- Guard-first on assert_admin(), SECURITY DEFINER with an empty search_path,
-- and deliberately not STRICT — a STRICT function skips its body on NULL input,
-- which would skip the guard. Validation mirrors the CHECKs and raises
-- check_violation with a sentence, because the admin form shows an RPC's own
-- message and a constraint name is not something an admin can act on. A
-- cover is checked by the cover-path trigger, which raises its own sentence.

CREATE FUNCTION public.create_library_article(
  p_title          text,
  p_summary        text DEFAULT NULL,
  p_body           text DEFAULT NULL,
  p_category       public.library_article_category DEFAULT NULL,
  p_cover_image_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_id    uuid;
  v_title text;
BEGIN
  PERFORM public.assert_admin();

  v_title := btrim(COALESCE(p_title, ''));

  IF v_title = '' THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.library_articles (
    author_id, category, title, summary, body, cover_image_id
  )
  VALUES (
    auth.uid(),
    p_category,
    v_title,
    btrim(COALESCE(p_summary, '')),
    btrim(COALESCE(p_body, '')),
    p_cover_image_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_library_article(text, text, text, public.library_article_category, uuid) IS
  'Admin-gated create of a Library article''s working copy; returns its id, '
  'which is the article''s URL. Stamps the caller as author. Only a title is '
  'required — everything else may wait for later saves, and nothing is '
  'published. Text is trimmed. The cover is a catalogue entry id, and the '
  'cover-path trigger refuses one that is gone or not a library cover. SECURITY DEFINER '
  'because library_articles carries no write grant: this and '
  'save_library_article are the only ways a row is written. The optional '
  'parameters default NULL because codegen cannot express an explicit null for '
  'a non-defaulted argument.';

REVOKE EXECUTE ON FUNCTION public.create_library_article(text, text, text, public.library_article_category, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_library_article(text, text, text, public.library_article_category, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_library_article(text, text, text, public.library_article_category, uuid) TO service_role;

CREATE FUNCTION public.save_library_article(
  p_id             uuid,
  p_title          text,
  p_summary        text DEFAULT NULL,
  p_body           text DEFAULT NULL,
  p_category       public.library_article_category DEFAULT NULL,
  p_cover_image_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_title text;
BEGIN
  PERFORM public.assert_admin();

  v_title := btrim(COALESCE(p_title, ''));

  -- The same check its create sibling makes, written out rather than shared:
  -- a private validator would be a function no role may call.
  IF v_title = '' THEN
    RAISE EXCEPTION 'An article needs a title'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, so an omitted optional
  -- argument clears its field — which is how one is cleared.
  UPDATE public.library_articles SET
    category       = p_category,
    title          = v_title,
    summary        = btrim(COALESCE(p_summary, '')),
    body           = btrim(COALESCE(p_body, '')),
    cover_image_id = p_cover_image_id
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.save_library_article(uuid, text, text, text, public.library_article_category, uuid) IS
  'Admin-gated save of a Library article''s WORKING COPY; returns its id. It '
  'never touches the published copy, so the live article is unchanged until '
  'publish_library_article is called. Assigns every editable column on every '
  'call — an omitted optional argument clears that field, which is the only '
  'way to clear one — so a column added later has to reach this statement in '
  'the same change. Normalisation and validation are create_library_article''s. '
  'An id no article has raises no_data_found rather than silently saving '
  'nothing.';

REVOKE EXECUTE ON FUNCTION public.save_library_article(uuid, text, text, text, public.library_article_category, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_library_article(uuid, text, text, text, public.library_article_category, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.save_library_article(uuid, text, text, text, public.library_article_category, uuid) TO service_role;

CREATE FUNCTION public.publish_library_article(p_id uuid) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_article public.library_articles;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_admin();

  -- Locked, so a save racing this publish lands wholly before or wholly after
  -- the copy rather than half in it.
  SELECT * INTO v_article
    FROM public.library_articles
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A cover is not among these: an article may go live without one.
  IF btrim(v_article.summary) = '' THEN v_missing := array_append(v_missing, 'a summary'); END IF;
  IF btrim(v_article.body) = ''    THEN v_missing := array_append(v_missing, 'a body'); END IF;
  IF v_article.category IS NULL    THEN v_missing := array_append(v_missing, 'a category'); END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'The article cannot be published without %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The link is copied and the path is not: the cover-path trigger derives
  -- the published copy's own.
  INSERT INTO public.library_article_publications (
    article_id, category, title, summary, body, cover_image_id,
    published_at, first_published_at
  )
  VALUES (
    v_article.id, v_article.category, v_article.title, v_article.summary,
    v_article.body, v_article.cover_image_id, now(), now()
  )
  ON CONFLICT (article_id) DO UPDATE SET
    category       = EXCLUDED.category,
    title          = EXCLUDED.title,
    summary        = EXCLUDED.summary,
    body           = EXCLUDED.body,
    cover_image_id = EXCLUDED.cover_image_id,
    published_at   = EXCLUDED.published_at;
  -- first_published_at is deliberately absent from the SET list: a republish
  -- of a live article keeps the date it first went live.

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.publish_library_article(uuid) IS
  'Admin-gated publish: copies the article''s working copy over its published '
  'copy in one statement, making it live or replacing the live version. '
  'Refuses with check_violation, naming every missing field in one sentence, '
  'a working copy without a summary, a body or a category — the published '
  'copy''s CHECKs are the backstop. A cover is optional: an article without '
  'one goes live with none. A republish moves published_at and keeps '
  'first_published_at. The working copy is locked for the copy, so a '
  'concurrent save lands wholly before or after it. An id no article has '
  'raises no_data_found. SECURITY DEFINER because neither table carries a '
  'write grant.';

REVOKE EXECUTE ON FUNCTION public.publish_library_article(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_library_article(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.publish_library_article(uuid) TO service_role;

CREATE FUNCTION public.unpublish_library_article(p_id uuid) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.library_articles WHERE id = p_id) THEN
    RAISE EXCEPTION 'Library article not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.library_article_publications WHERE article_id = p_id;

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.unpublish_library_article(uuid) IS
  'Admin-gated unpublish: deletes the article''s published copy, taking it off '
  'every public page, and leaves the working copy exactly as it was. It exists '
  'so a mistake can be taken down; there is no delete of the article itself. '
  'Unpublishing an article that is not live is a no-op, since the state asked '
  'for already holds; an id no article has raises no_data_found. Publishing '
  'again afterwards starts a new first_published_at.';

REVOKE EXECUTE ON FUNCTION public.unpublish_library_article(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unpublish_library_article(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.unpublish_library_article(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The catalogue's replace reaches the covers
-- ---------------------------------------------------------------------------
-- The image catalogue's replace resolves the new picture to its own entry and
-- then moves every link from the old entry to the new one. Products it moves
-- with a plain UPDATE on the admin's session; the Library's two tables carry
-- no write grant, so their half of the repoint is this function. Both copies
-- move in one statement, so a live cover changes with no republish, and the
-- cover-path trigger re-derives each path and refuses a new entry that is not
-- a Library cover.

CREATE FUNCTION public.repoint_library_covers(p_from uuid, p_to uuid) RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_moved integer;
BEGIN
  PERFORM public.assert_admin();

  -- Moving covers to no entry is a removal, which the catalogue does by
  -- deleting the entry; this function only ever moves them to another.
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A repoint needs the entry being replaced and its replacement'
      USING ERRCODE = 'null_value_not_allowed';
  END IF;

  WITH drafts AS (
    UPDATE public.library_articles
       SET cover_image_id = p_to
     WHERE cover_image_id = p_from
    RETURNING id
  ),
  live AS (
    UPDATE public.library_article_publications
       SET cover_image_id = p_to
     WHERE cover_image_id = p_from
    RETURNING article_id
  )
  SELECT count(*) INTO v_moved
    FROM (SELECT id FROM drafts UNION SELECT article_id FROM live) AS moved;

  RETURN v_moved;
END;
$$;

COMMENT ON FUNCTION public.repoint_library_covers(uuid, uuid) IS
  'Admin-gated half of the image catalogue''s replace: points every Library '
  'cover that uses entry p_from — working copies and published copies alike — '
  'at entry p_to, in one statement, and returns how many articles moved (an '
  'article whose working and live covers both moved counts once). A live '
  'article''s cover changes without a republish. The cover-path trigger '
  're-derives each path and refuses a p_to that is gone or not a library '
  'cover. Either '
  'argument NULL raises null_value_not_allowed. SECURITY DEFINER because '
  'neither Library table carries a write grant.';

REVOKE EXECUTE ON FUNCTION public.repoint_library_covers(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.repoint_library_covers(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.repoint_library_covers(uuid, uuid) TO service_role;

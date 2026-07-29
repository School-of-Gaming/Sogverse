-- Adds French to the `spoken_languages` reference table.
--
-- WHY
--
-- Locale and spoken language are deliberately separate systems: `locale` is
-- which translation of the app you see, `spoken_languages` is the human
-- languages you speak / a club is delivered in. They are not merged — but they
-- do carry a parity requirement in one direction: **every real (non-novelty) UI
-- locale must have a matching spoken language.** Shipping a French UI says we
-- serve French-speaking families; a `products.spoken_language_code` of 'fr' has
-- to be offerable the same day, and the FK to this table is what decides that.
-- Klingon is exempt — it is an easter egg, not a language a club is delivered
-- in.
--
-- A CI db test asserts the parity in both directions from the app side (every
-- SUPPORTED_LOCALES entry except 'tlh' has a row here), so a future locale that
-- forgets this migration fails the build rather than shipping a UI whose
-- language nobody can be enrolled in.
--
-- NAME
--
-- `name` is the English display name, matching the three rows already here
-- ('Finnish', 'Swedish', 'English'). The column is not localized and does not
-- need to be: every UI surface that shows a spoken language resolves the code
-- through `Intl.DisplayNames` in the viewer's own locale, and falls back to this
-- column only for a code Intl cannot name.
--
-- Data-only migration: no schema change, no grant change, no RLS change. The
-- table's existing grants (SELECT to anon/authenticated, ALL to service_role)
-- and policies (public read, admin write) already cover the new row.
--
-- IDEMPOTENT
--
-- `code` is the primary key, so ON CONFLICT DO NOTHING makes a re-run a no-op.

INSERT INTO public.spoken_languages (code, name)
VALUES ('fr', 'French')
ON CONFLICT (code) DO NOTHING;

-- Fail loudly if the row is not there afterwards. Cheap, and the alternative is
-- discovering it when an admin cannot pick French for a club.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.spoken_languages WHERE code = 'fr') THEN
    RAISE EXCEPTION 'spoken_languages: French row missing after insert';
  END IF;
END;
$$;

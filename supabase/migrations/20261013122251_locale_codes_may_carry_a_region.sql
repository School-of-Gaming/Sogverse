-- Locale codes may carry a region.
--
-- WHAT THIS CHANGES
--
-- The six translation tables' locale-format CHECKs accepted a bare language
-- subtag only (`en`, `fi`, `sv`), so content written for a regional locale
-- such as `en-us` could not be saved. Each now accepts a bare language subtag
-- of two or three lowercase letters, optionally followed by a hyphen and a
-- lowercase two-letter region: the shape of every locale segment the app can
-- route (src/i18n/CLAUDE.md). Each constraint keeps its name.
--
-- WHAT DID NOT CHANGE
--
-- No regional locale is added: the app's locale set decides which codes
-- exist, and the database only refuses a malformed one. Every stored code is
-- a bare subtag, which the wider pattern still accepts, so the re-validation
-- each ADD CONSTRAINT runs passes. Mixed case (`en-US`) and underscores
-- (`en_us`) stay refused: the app writes locale codes in lowercase with a
-- hyphen, and one spelling per code is what keeps a lookup by locale exact.
-- profiles.locale and product_translations.locale carry no format CHECK and
-- gain none here.

ALTER TABLE public.landing_page_translations
  DROP CONSTRAINT chk_landing_page_translations_locale_format,
  ADD CONSTRAINT chk_landing_page_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

ALTER TABLE public.landing_page_publication_translations
  DROP CONSTRAINT chk_landing_page_publication_translations_locale_format,
  ADD CONSTRAINT chk_landing_page_publication_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

ALTER TABLE public.library_article_translations
  DROP CONSTRAINT chk_library_article_translations_locale_format,
  ADD CONSTRAINT chk_library_article_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

ALTER TABLE public.library_article_publication_translations
  DROP CONSTRAINT chk_library_article_publication_translations_locale_format,
  ADD CONSTRAINT chk_library_article_publication_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

ALTER TABLE public.spotlight_translations
  DROP CONSTRAINT chk_spotlight_translations_locale_format,
  ADD CONSTRAINT chk_spotlight_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

ALTER TABLE public.team_profile_translations
  DROP CONSTRAINT team_profile_translations_locale_format,
  ADD CONSTRAINT team_profile_translations_locale_format
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z]{2})?$');

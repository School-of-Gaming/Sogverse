-- Every extension installed in this database — ours and the image's — in the schema it was installed into, with its version as a trailing comment.
-- Generated from the database by `npm run db -- generate`; never hand-edited.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;  -- 1.6.4
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;  -- 1.11
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;  -- 1.6
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- 1.3
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;  -- 1.0
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;  -- 0.3.1
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;  -- 1.1
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;  -- 1.1

-- Make profiles.last_name required.
--
-- Until now last_name was nullable and only the parent-signup form enforced it;
-- the gedu-setup, admin gedu-invite, and settings forms all let it through blank,
-- and the column allowed NULL. We now require a last name for all new human input
-- (UI + the create-gedu API), backed by a NOT NULL column.
--
-- Backfill keeps legacy rows valid: every existing NULL becomes ''. Empty string
-- stays a legal value on purpose -- the constraint can only be NOT NULL, not a
-- minimum length, because (a) these backfilled legacy rows hold '' and (b) gamers
-- never supply a last name and inherit the parent's (which is '' when the parent
-- has none, see api/gamers/create). "Really required" is enforced at the UI/API
-- edges for fresh human input; the DB just guarantees non-NULL. The handle_new_user
-- trigger already COALESCEs missing metadata to '' so signups need no change.

UPDATE public.profiles SET last_name = '' WHERE last_name IS NULL;

-- DEFAULT '' keeps the generated Insert type's last_name optional rather than
-- forcing every .insert() call site to spell out an empty string.
ALTER TABLE public.profiles ALTER COLUMN last_name SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN last_name SET NOT NULL;

-- Drop the old "NULL or <=32" check; with the column NOT NULL the NULL branch is
-- dead, so the constraint collapses to a plain length bound.
ALTER TABLE public.profiles DROP CONSTRAINT profiles_last_name_len;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_last_name_len
  CHECK (char_length(last_name) <= 32);

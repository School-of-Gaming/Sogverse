-- Drop profiles.username — gamers are email-first now (migration 00100).
--
-- The opaque g<hex> username was only ever the gamer login identifier: it
-- seeded the synthetic <token>@gamer.sogverse.internal address. That address
-- now lives on profiles.email (NOT NULL for every role) and all readers have
-- been repointed at it, so the column and the machinery around it are dead.

-- auth_identifier_check enforced "gamers have a username, others have an email".
-- email is now NOT NULL for every role, making the check obsolete. Drop it
-- first — it references username, so the column drop would otherwise cascade
-- into it implicitly; doing it explicitly keeps the intent visible.
ALTER TABLE public.profiles DROP CONSTRAINT auth_identifier_check;

-- Drop the column. Its UNIQUE constraint (profiles_username_key) and filtered
-- unique index (idx_profiles_username) are dropped automatically with it.
ALTER TABLE public.profiles DROP COLUMN username;

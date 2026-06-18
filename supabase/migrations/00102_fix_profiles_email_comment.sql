-- Refresh the profiles.email column comment.
--
-- It still claimed "NULL for gamer accounts", which stopped being true once
-- migration 00100 backfilled gamers' synthetic addresses and made email
-- NOT NULL for every role. Gamers are no longer special: they carry a real,
-- queryable email like everyone else. Today that address is a generated
-- <token>@gamer.sogverse.internal value the gamer never sees or types; if a
-- gamer is ever given a real inbox, the email is simply updated in place and
-- they sign in through the same flow as any other account.

COMMENT ON COLUMN public.profiles.email IS 'Email address (NOT NULL for every role). Gamer accounts carry a generated synthetic <token>@gamer.sogverse.internal address until/unless replaced by a real one.';

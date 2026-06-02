-- Parent (customer) account PIN.
--
-- A 4-digit PIN gates entry into a parent account: a customer session is
-- "locked" until the PIN is provided once (enforced in src/proxy.ts for pages
-- and src/lib/auth.ts requireRole() for API routes). The PIN — not the
-- password — is the real boundary, because on a shared family device the
-- password is typically saved/autofilled. See docs/parent-pin-architecture.md.
--
-- One PIN per parent account, stored as a bcrypt hash on customer_profiles.
-- Verification and mutation go through auth.uid()-scoped SECURITY DEFINER RPCs;
-- the hash is never read by the client. There is intentionally no rate-limiting
-- and no PIN-strength validation beyond "exactly 4 digits" — the PIN blocks
-- young children, and a parent who picks 0000 has made their own trust call.

-- pgcrypto provides crypt()/gen_salt(). On Supabase it lives in the extensions
-- schema; `if not exists` is a no-op when it's already enabled (in whichever
-- schema), and the functions below put both public and extensions on their
-- search_path so the calls resolve either way.
create extension if not exists pgcrypto with schema extensions;

-- null = no PIN set yet (the lock gate offers "create" instead of "enter").
alter table customer_profiles add column if not exists pin_hash text;

-- =============================================================================
-- set_my_pin — create / change / reset the caller's PIN
-- =============================================================================
-- Overwrites unconditionally for the current user. "Require current PIN" for
-- the settings change-flow, and identity for the email-reset flow, are enforced
-- by the calling API route, not here.
create or replace function set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits';
  end if;

  update customer_profiles
    set pin_hash = crypt(p_pin, gen_salt('bf'))
    where user_id = auth.uid();

  if not found then
    raise exception 'No customer profile for the current user';
  end if;
end;
$$;

-- =============================================================================
-- verify_my_pin — constant-time check of a candidate PIN against the stored hash
-- =============================================================================
-- crypt(candidate, stored_hash) re-hashes the candidate with the stored salt and
-- compares; returns false when no PIN is set or no customer_profiles row exists.
create or replace function verify_my_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select coalesce(
    (select pin_hash = crypt(p_pin, pin_hash)
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- pin_is_set — whether the caller has a PIN configured (create vs. enter branch)
-- =============================================================================
create or replace function pin_is_set()
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select coalesce(
    (select pin_hash is not null
       from customer_profiles
      where user_id = auth.uid()),
    false
  );
$$;

-- Intentionally browser-callable (via the user's server client in the PIN API
-- routes): each is auth.uid()-scoped and only touches the caller's own row.
-- Listed in tests/db/access-control.test.ts AUTHENTICATED_ALLOWLIST.
revoke execute on function set_my_pin(text) from public;
revoke execute on function verify_my_pin(text) from public;
revoke execute on function pin_is_set() from public;
grant execute on function set_my_pin(text) to authenticated;
grant execute on function verify_my_pin(text) to authenticated;
grant execute on function pin_is_set() to authenticated;

-- Harden create_gamer (00113): only promote a profile that is still a 'customer'.
--
-- create_gamer() is SECURITY DEFINER and service_role-only, and its sole caller
-- (src/app/api/gamers/create/route.ts) always hands it a brand-new auth user —
-- a trigger-seeded 'customer'. But the function itself blindly promoted whatever
-- id it was given: role := 'gamer', delete customer_profiles, insert the gamer
-- rows. A future caller (or a bug) passing an already-promoted gamer, an admin,
-- or a gedu id would corrupt that account. Not exploitable today, but a sharp
-- footgun for a SECURITY DEFINER function.
--
-- Make it self-defending: gate the promotion UPDATE on role = 'customer'. The
-- existing `if not found` now doubles as a "not a promotable customer" guard — a
-- non-existent id, or one whose profile is already a gamer/admin/gedu, aborts the
-- whole transaction instead of mutating it. It also makes a double-call (same id
-- twice) fail cleanly on the second call instead of re-running the swap.
--
-- Limitation: 'customer' IS the parent role, so this can't distinguish a fresh
-- trigger-seeded customer from an established parent — there's no clean column
-- that separates them. This blocks the clearly-wrong roles and double-promotion,
-- not a (hypothetical) caller passing a real parent's id.
create or replace function public.create_gamer(
  p_gamer_id uuid,
  p_parent_id uuid,
  p_first_name text,
  p_last_name text,
  p_date_of_birth date,
  p_gender public.gender_type default null,
  p_minecraft_username text default null,
  p_minecraft_uuid text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Promote the trigger-seeded customer profile to a gamer. Gate on role =
  -- 'customer' so this can't corrupt an already-promoted gamer or an admin/gedu,
  -- and so a double-call fails on the second pass. Keep the synthetic email
  -- handle_new_user() copied from auth.users — gamers are email-first.
  update public.profiles
  set role = 'gamer',
      first_name = p_first_name,
      last_name = p_last_name
  where id = p_gamer_id
    and role = 'customer';

  if not found then
    raise exception 'No promotable customer profile % found for gamer creation', p_gamer_id;
  end if;

  -- Swap extension tables: drop the customer row handle_new_user() created,
  -- add the gamer row.
  delete from public.customer_profiles where user_id = p_gamer_id;

  insert into public.gamer_profiles (user_id, date_of_birth, gender)
  values (p_gamer_id, p_date_of_birth, p_gender);

  -- Optional Minecraft link. A unique_violation here (the minecraft_uuid was
  -- claimed between the route's pre-check and now) propagates as SQLSTATE 23505,
  -- which the route maps to a 409 — and, being inside this transaction, aborts
  -- the whole creation rather than leaving a half-built gamer.
  if p_minecraft_username is not null then
    insert into public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    values (p_gamer_id, p_minecraft_username, p_minecraft_uuid);
  end if;

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;

revoke execute on function public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text) from public, anon, authenticated;
grant execute on function public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text) to service_role;

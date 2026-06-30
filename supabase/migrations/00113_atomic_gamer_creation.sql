-- Atomic gamer creation: promote + link in one transaction.
--
-- The gamer-creation route (src/app/api/gamers/create/route.ts) creates the
-- auth user via the Auth Admin API — which fires handle_new_user(), seeding a
-- 'customer' profile + a customer_profiles row — then promotes that row to a
-- gamer and links it to the parent. Those post-auth writes used to run as five
-- separate admin-client statements with NO transaction wrapping them, so a
-- failure partway through left an orphaned, half-promoted account: a profile
-- flipped to 'gamer' with no gamer_profiles row, a gamer with no parent link,
-- etc. This collapses them into one SECURITY DEFINER function so they commit or
-- roll back together. The route deletes the auth user if this raises.
--
-- Private: service_role only — called via the admin client, exactly like
-- set_pin_for_user (00076) and submit_feedback (00010). The route's
-- requireRole('customer') guard is the trust boundary and p_parent_id is the
-- verified caller's id; this function does not re-check the role (the
-- DB-authz refactor's Phase 3 may later move it to an authenticated-callable
-- guarded RPC — Phase 0 is atomicity only).
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
  -- Promote the trigger-seeded customer profile to a gamer. Keep the synthetic
  -- email handle_new_user() copied from auth.users — gamers are email-first.
  update public.profiles
  set role = 'gamer',
      first_name = p_first_name,
      last_name = p_last_name
  where id = p_gamer_id;

  if not found then
    raise exception 'Profile % not found for gamer promotion', p_gamer_id;
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

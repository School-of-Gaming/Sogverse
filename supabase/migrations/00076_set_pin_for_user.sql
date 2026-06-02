-- Admin-only PIN setter for the email-reset flow.
--
-- The reset path must let a parent overwrite a PIN they've forgotten WITHOUT
-- proving the current one — but that capability cannot be reachable from a
-- locked session on a shared device (a child could otherwise overwrite the PIN
-- they don't know). So reset is authorized by a signed token delivered to the
-- parent's email inbox (the one channel a child can't reach), validated in
-- /api/auth/pin/reset, which then calls this function via the service-role
-- admin client. set_my_pin() (00075) remains the auth.uid()-scoped path for
-- create/change and CANNOT overwrite an existing PIN without the current one.
--
-- Private: REVOKE from public/anon/authenticated, called only by the admin
-- client (service role), exactly like submit_feedback (00010).
create or replace function set_pin_for_user(p_user_id uuid, p_pin text)
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
    where user_id = p_user_id;

  if not found then
    raise exception 'No customer profile for user %', p_user_id;
  end if;
end;
$$;

revoke execute on function set_pin_for_user(uuid, text) from public, anon, authenticated;

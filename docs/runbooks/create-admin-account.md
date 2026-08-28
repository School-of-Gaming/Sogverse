# Creating an admin account by hand

There is no registration route, script, or admin UI that mints an **admin** account —
the signup trigger hardcodes `customer`, and the gamer/gedu RPCs are the only promotion
paths. Admins are made by hand, in two steps (connection details:
`remote-supabase-psql.md`):

1. `POST {SUPABASE_URL}/auth/v1/admin/users` with the service-role key — `email`,
   `email_confirm: true`, and `user_metadata` carrying `first_name` / `last_name` /
   `display_name`. The signup trigger seeds a `customer` profile plus a
   `customer_profiles` row.
2. Over psql: `UPDATE public.profiles SET role='admin', locale=… WHERE id=… AND
   role='customer'` then `DELETE FROM public.customer_profiles WHERE user_id=…`.
   There is **no `admin_profiles` extension table** — an admin is a bare `profiles` row
   with no extension row at all. (Two legacy staging admins still carry a stale
   `customer_profiles` row; that is drift, not the pattern.)

- **Omit `password` entirely — owner's ruling, 2026-08-21.** The person sets their own
  through `/api/auth/forgot-password`, which needs only a `profiles` row matching the
  email — no role check, no prior password — and mails in `profiles.locale`.
- **Get it right on the first call.** There is no clean way to unset a password
  afterwards — the admin PATCH takes a new password but will not clear one. If an
  account was created with one, DELETE the auth user and re-create it passwordless (the
  `profiles` row cascades away, so re-run step 2) — cheap only while the account is
  brand new and nothing references it.
- **Caveat (2026-08-21):** GoTrue writes a 60-char bcrypt hash into
  `auth.users.encrypted_password` even when the create call sends no `password` key.
  Neither `""` nor `" "` authenticates, so the account is unusable-by-password as
  intended.

# Correcting a user's email by hand

There is no email-change flow in the app — `profiles.email` carries no UPDATE grant for
`authenticated`, so even an admin session cannot write it through PostgREST. Hand
corrections take two writes (connection details: `remote-supabase-psql.md`):

1. **Auth** — `PUT {SUPABASE_URL}/auth/v1/admin/users/{id}` with the service-role key
   and `{"email": …, "email_confirm": true}`.
2. **Profiles** — over psql, `UPDATE public.profiles SET email=… WHERE id=…`. Nothing
   syncs this; the signup trigger copies the address on INSERT only.

Do auth **first** — it is the only write that enforces uniqueness, so it is the one
that can legitimately fail.

- **THE TRAP: never `UPDATE auth.users SET email` in psql.** `auth.identities.email` is
  a GENERATED column (`lower(identity_data->>'email')`), so a raw SQL update on
  `auth.users` leaves the identity pointing at the old address. The Admin API moves
  `auth.users` **and** `auth.identities` together — verified on staging 2026-08-28. It
  does **not** touch `profiles`.
- Every identity is provider `email` with `provider_id = user_id`, so there is no
  email-keyed unique index to collide with there.
- After the Admin API call, sign-in with the new address returns 200 and the old
  address 400. The password is untouched. **Session survival is unverified** — worst
  case is one re-login.
- `trg_reset_email_verification` nulls `profiles.email_verified_at` on any email
  change, and every outstanding verification link self-invalidates (its HMAC re-derives
  from the current address). Nothing to clean up by hand.
- **Stripe needs no repair and cannot break.** The join is
  `customer_profiles.stripe_customer_id`; nothing ever resolves a customer by email.
  The Stripe customer's own email is frequently *already correct* while ours is wrong —
  Checkout collects it fresh, and the billing portal lets the customer edit it. Read it
  before assuming it needs changing.

Worked case, prod 2026-08-28: a signup address with one stray trailing character,
consistent across users/identities/profiles, target address unused, Stripe already
correct — so only our own transactional mail had ever been bouncing. Both writes landed
clean with every linkage (Stripe customer, linked gamer, participation) untouched.

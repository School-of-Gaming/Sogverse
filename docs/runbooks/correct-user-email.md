# Correcting a user's email by hand

There is no email-change flow in the app — `profiles.email` carries no UPDATE grant for
`authenticated`, so even an admin session cannot write it through PostgREST. The signup
typo is therefore a hand operation.

`scripts/correct-user-email.ts` is the how; this file is the why. Report-only unless
told otherwise, and safe to repeat:

```bash
npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod          # report
npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod --apply  # write
```

Without `--prod` it runs against staging. Connection details for reading the result back:
`remote-supabase-psql.md`.

## The two writes, and why the order is fixed

1. **Auth**, through the Admin API. **Never `UPDATE auth.users SET email` in psql**:
   `auth.identities.email` is a GENERATED column over `identity_data->>'email'`, so a raw
   SQL update leaves the identity on the old address — sign-in keeps answering to the old
   email while everything on screen says the change worked. The Admin API moves
   `auth.users` and `auth.identities` together.
2. **`public.profiles`**, which nothing syncs; the signup trigger copies the address on
   INSERT only. `service_role` holds UPDATE on the column, so the script does both writes
   and no psql step is needed.

Auth goes first because it is the only write that enforces uniqueness, and so the only
one that can legitimately fail. If it fails, `profiles` is untouched and there is nothing
to unwind. If the second write fails instead, re-running finishes the job — the script
detects that `profiles` is the half left behind and brings it into line.

**Verifying the identity moved needs a fresh read, not the update's response.**
`updateUserById` returns the `identities` array as it was *before* the write, so checking
the response reports a failure on every successful run. The script re-reads the user; a
hand check reads `auth.identities` over psql.

## When the target address is already taken

That is the duplicate-account case, not a typo, and the script refuses it rather than
guessing. Someone registered twice — once with the typo, once correctly — and the second
account has to be dealt with before the address is free. Inventory both sides first
(every FK to `public.profiles`, so nothing is missed), then decide:

- **The correct-email account is empty** — no linked gamer, no participation, no payment.
  Delete it through the Admin API and rename the account that holds the data. Deleting
  the auth user cascades through `profiles` to `customer_profiles`, `marketing_consents`
  and the rest, which frees the address.
- **Both accounts hold data.** Move the rows, don't delete. Which account survives is a
  judgement call, not a default.

Either way, **carry the consent rows across**. A marketing consent granted under the
correct address is a real opt-in, and cascading it away silently is the wrong outcome —
re-insert it against the surviving account, preserving the original timestamp.

## What needs no repair

- **Stripe cannot break.** The join is `customer_profiles.stripe_customer_id`; nothing
  resolves a customer by email. A Stripe customer is only ever minted inside checkout or
  the billing portal, and the id is cached back in the same call, so there is no unlinked
  customer to strand. The Stripe customer's own email is frequently *already* correct
  while ours is wrong — Checkout collects it fresh and the billing portal lets the
  customer edit it. Read it before assuming it needs changing. A product billed
  `external_contract` never touches Stripe at all.
- **Verification state.** `trg_reset_email_verification` nulls `profiles.email_verified_at`
  on any email change, and every outstanding verification link self-invalidates (its HMAC
  re-derives from the current address).
- **The password**, which is untouched. Worst case is one re-login. Note the surviving
  account keeps *its own* credentials: after a duplicate purge the user's password and
  parent PIN are the ones from the account that survived, which may not be the one they
  most recently registered — worth telling them.
- **Every identity** is provider `email` with `provider_id = user_id`, so there is no
  email-keyed unique index to collide with there.

## Verification

Sign-in with the new address returns 200 and the old address 400. Read all three back in
one query — `auth.users.email`, `auth.identities.email` and `profiles.email` must agree;
two out of three is the failure this procedure exists to prevent.

Last executed against prod 2026-09-03: a duplicate-account case (typo account holding a
linked gamer and an active club seat, correct-email account empty). The empty account was
deleted, the typo account renamed, its consent carried across, and all three columns
verified in agreement.

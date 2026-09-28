---
name: correct-user-email
description: Resolve a user's email change the admin user page refuses — a duplicate account already holding the right address — or change addresses from a script (bulk, or with no admin session). A plain signup typo is fixed in-app, from the pencil beside the address on the admin user page. Runs scripts/correct-user-email.ts.
---

# Correcting a user's email by hand

**A plain signup typo is not a hand operation any more.** An admin fixes it from the
pencil beside the address on the user's admin page (`/admin/users/<id>`), which runs the
same two writes described below through `PATCH /api/admin/users/[id]/email`, and signs
the account out besides (sessions and passwords, below). That page
refuses exactly one case — the target address already belongs to another account — and
that case is this skill's reason to exist. The script also remains for scripted or bulk
changes, and for when there is no admin session to hand.

**A gamer's address is in scope only in `email` sign-in mode.** A child in `parent` or
`username` mode holds a synthetic `@gamer.sogverse.internal` handle, and moving it to a real
mailbox is a privilege change, not a correction: a `parent`-mode child could then set a
password and sign in without the parent. The page refuses it, and the script does not
check, so don't use the script to get around the refusal — changing how a child signs in
is the parent's, from their own settings. A `username`-mode child's username is renamed
in-app, from the personal-details pencil on their admin page.

`scripts/correct-user-email.ts` is the how; this skill is the why. Report-only unless
told otherwise, and safe to repeat:

```bash
npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod          # report
npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod --apply  # write
```

Without `--prod` it runs against staging. Connection details for reading the result back:
the `remote-supabase` skill.

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

That is the duplicate-account case, not a typo, and both the admin page and the script
refuse it rather than guessing. Someone registered twice — once with the typo, once correctly — and the second
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
- **Sessions and passwords, when the page makes the change.** It signs the account out
  of every device, whatever the role. An adult keeps their password; an `email`-mode
  child's is removed (set to NULL) and the welcome mail goes to the new address so they
  set a new one, because a password set against the old address must not carry over to
  an unproven one. **The script does none of this**: it moves the address and nothing
  else, so sessions stay signed in and every password stays as it was — for an
  `email`-mode child, the old password then opens the account at its new address. Prefer
  the page for one. Note the surviving account keeps *its own* credentials: after a
  duplicate purge the user's password and parent PIN are the ones from the account that
  survived, which may not be the one they most recently registered — worth telling them.
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

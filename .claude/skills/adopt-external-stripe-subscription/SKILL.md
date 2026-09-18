---
name: adopt-external-stripe-subscription
description: Bring families whose live Stripe subscription was created outside Sogverse's checkout (Chargebee-migrated cohorts, hand-made subs) onto a Sogverse club — create any missing parent and gamer accounts on prod, then adopt-and-bind the existing subscription to a seat without changing it in Stripe. Also splitting bundled subs, merging guardian accounts, comping a free visit to a paid club, the Stripe-side sweep for unbound subs, and the end-of-batch message to the organizer.
---

# Adopting an external Stripe subscription onto a club

Makes a live subscription created outside Sogverse's checkout behave like a native
purchase: the parent sees the child enrolled, Manage billing opens their real
subscription, and a cancel or non-payment frees the seat. **Adopt-and-bind — never
cancel and re-subscribe, never swap the price.** Batches arrive as a roster from the club
organizer; the people involved and past batch precedents are in local memory, not here.

Tools: prod psql (the `remote-supabase` skill); the Auth admin API, which needs the prod
service-role key — deliberately absent from `.env.local`, so ask the owner for it, and it
is rotated afterwards; the Stripe CLI in live mode; the Mojang API. The Stripe CLI is
pinned to an old API version, so `search` calls take `--stripe-version 2020-08-27`.

## Step 1 — Identify and dedupe before creating anything

- **Find the Stripe customer and subscription.** Email lookup is **case-sensitive**, and
  parents accumulate many duplicate customers — an empty one under `name@` while the paying
  one sits under `Name@` is common. List by email with `--limit 100`, never a small cap
  (a small cap once truncated past the paying customer), and always follow with
  `stripe customers search --query "name:'…'"` before concluding a family has no
  subscription. A blank roster email means nothing was searched, not that there is no sub.
- **List subscriptions with `--status all`** — the customer object's embed hides cancelled
  ones. Re-read every status live: a roster's status column is a point-in-time snapshot
  and goes stale in both directions.
- **Check whether the family is already in Sogverse, three ways**: by parent email, by the
  child's Minecraft UUID (resolve the username through Mojang, look it up in
  `minecraft_accounts.minecraft_uuid`), and — for rosters with no Minecraft handle — by
  child first name plus stored DOB month and year. A household often exists under a
  *different guardian's* email; only the child-side checks catch it. If found, consolidate
  onto the existing account.
- **When a parent holds several live subs, first check which are already bound**
  (`family_subscriptions` by `stripe_subscription_id`). The others are usually bound to the
  child's other club from an earlier batch, which turns a question into a lookup.
- **Resolve each sub's Stripe product name before calling it the wrong product.** Migrated
  products are named `<WEEKDAY> <HH:MM–HH:MM>: <club name>`, which maps straight onto a
  Sogverse product's slot; the `prod_…` id alone says nothing. Two Stripe products can carry
  the same club name, one per migration wave. Where a sub genuinely is on the wrong
  product (billing drift from the old platform — a group switch that never reached
  billing), adopt it anyway at its existing price; the product cleanup is separate work.
- **A roster's "Sogverse ID" column has held the parent's profile id, not the gamer's**,
  and its "parent first name" column frequently holds the child's name. Resolve before
  assuming.

## Step 2 — Create missing accounts (Auth admin API, `POST /auth/v1/admin/users`)

- **Parent:** `{email, email_confirm: true}` and no password — the first sign-in goes
  through the forgot-password link. The signup trigger makes the `customer` profile and
  `customer_profiles` row, and reads `first_name`/`last_name` from `user_metadata`; omit
  them and the profile lands as `New User`. The parent sets their PIN on first sign-in.
- **Gamer:** the same create call (a synthetic `g<16hex>@gamer.sogverse.internal` email and
  a password), then **one `create_gamer` RPC call does the whole promotion
  transactionally**. Read its current signature from `supabase/schema.sql` and mirror the
  gamer-create API route rather than a remembered sequence. If the RPC fails, delete the
  auth user through the Admin API before retrying — the trigger already made a `customer`
  profile, and a retry collides with it.
- **DOB:** the UI stores month and year as `YYYY-MM-01`. **Never infer a birth date** — a
  blank one blocks the child (the column is NOT NULL, and it drives age gating); seat the
  rest and ask for month and year. Look in SOGGA first (the `sogga-legacy-data` skill): a
  migrated child's real name and birthdate are usually there, and only a Chargebee-only
  signup has no SOGGA row at all. Old WooCommerce `childAge` metadata is stamped at
  original signup and years stale — use it to confirm identity, never to derive an age.
- **Minecraft:** resolve `https://api.mojang.com/users/profiles/minecraft/<name>` to a
  dashed UUID; store the username as given plus the UUID (null if unresolved).
  `minecraft_uuid` is UNIQUE — collision-check first.
- **Names:** a child always takes the parent's surname (owner's ruling, 2026-08-17), which
  is what the gamer-create route does; another system naming the child differently is not a
  discrepancy. The few existing families that differ are real families' names — leave
  them. What still needs asking is a first-name field holding something surname-shaped:
  a parent's whole name crammed into `first_name` with `last_name` blank makes a naive
  surname comparison report a match on two blanks.
- **Non-ASCII names get mangled on the way in.** After any batch that creates accounts,
  verify with `length` vs `octet_length` and run the sweep for U+FFFD in
  `profiles.first_name`/`last_name` — it must return zero. Repair with a Postgres unicode
  escape (`U&'\00e4'` for `ä`), which is pure ASCII over the wire. The signup trigger copies
  names once, so fixing auth metadata leaves the profile unfixed.

## Step 3 — Adopt-and-bind: three writes per subscriber, no Stripe change

1. **`customer_profiles.stripe_customer_id = <existing cus_…>`**, guarded `WHERE … IS NULL`.
   This is the make-or-break: the billing portal resolves the parent's customer from this
   column and mints a new empty customer when it is null, stranding the real sub.
   **Re-bind case:** a parent already bound to an empty Sogverse-minted customer (tell:
   `metadata.user_id` set and zero subscriptions under `--status all`) while the real sub
   sits on another customer under the same email — overwrite, guarded on the old empty id.
   Distinguish it from a profile customer holding a real sub of its own; leave that one.
   Fix these before the parent opens Manage billing, which mints the empty customer.
2. **Insert the `participations` row** (product, gamer, customer, status `active`) — the
   seat. A remote club (`products.is_remote`) needs `group_id` on the seat, or the voice
   room refuses the child as not enrolled.
3. **Insert `family_subscriptions`** keyed on the existing `stripe_subscription_id`, with
   `stripe_customer_id`, `stripe_price_id` (**honour the price the sub is already on**),
   currency, status and `current_period_end` from Stripe. Status: `trialing` is recorded
   `active`, `past_due` as `past_due`, `cancel_at_period_end` on a live sub as `canceling`
   — the same mapping the webhook applies.

Write idempotent, guarded SQL — seat CTE, insert-where-not-exists, then the subscription
insert `ON CONFLICT (stripe_subscription_id) DO NOTHING`. **That conflict clause silently
leaves an orphan seat** when the sub is already bound elsewhere: compare the INSERT counts
with the rows passed, and after every batch the orphan check — active seats on paid
`consumer_club` products with no `family_subscriptions` row — must return zero (camps and
events legitimately have none).

## Chargebee-migrated cohorts

Most external subs came from the June 2026 Chargebee → Stripe migration (the
`chargebee-to-stripe` project; its archive, including one-time invoices, is the record
for anything Chargebee knew).

- **A `trialing` migrated sub is intentional**: `trial_end` is the prepaid Chargebee term,
  so the first Stripe charge lands exactly when it ends.
- **Chargebee `non_renewing` / `cancelled_at` equal to `trial_end` is a migration artifact**,
  not churn — the migration set it on every ported sub (130 of 156). A Chargebee
  `cancelled` has also proven stale. Judge churn from Stripe status and invoices, and ask
  the organizer rather than inferring.
- **Migrated vs still on Chargebee is the latest charge**: `"Invoice XXXX-000N"` with an
  invoice id is Stripe; `"ChargeBee customer: …"` with no invoice is Chargebee.
- **One-time Chargebee payments were not migrated** (camps, N-month prepay), so a child's
  current club can have no sub to adopt. Create a free-trial Stripe sub (`trial_end` = term
  end, the club's price, `proration_behavior=none`, the customer's default payment method),
  then bind it. First search `metadata['chargebee_customer_id']` for **every** Chargebee id
  the customer has, so nothing already migrated is duplicated. The term length is in the
  archive invoice's SKU (`…-3MO-…`); the SKU's weekday may be outdated, so match the club
  on theme.
- **A €0 `Hengari` sub is the free Discord hangout, not a club.** A family whose only live
  sub is that one has nothing to adopt — flag it, don't create a trial.

## Bundled multi-club subscriptions

Some Chargebee packages were generic bundles (`FIN - Twice a week` €75,
`Yksi kerta viikossa` €39) covering 2+ clubs. Sogverse is one sub per gamer per product
(`family_subscriptions` is unique on both the sub and the participation), so a bundle binds
to exactly one seat. **Split it only once the second club is in Sogverse**; until then
seat the migrated club only, and never seat without a subscription row (teardown keys off
the sub id, so that seat would never be freed). This is a finite migration cost, not a
defect.

**Split procedure — the order is destructive if wrong. Never cancel the bundle first**:
cancelling fires `customer.subscription.deleted`, and the webhook hard-deletes the seat
bound to it.

1. One price per club at the divided amount, on **that club's own Stripe product**.
2. One sub per club on the **same customer** (a second customer breaks the parent's billing
   portal), each with `trial_end` = the bundle's `current_period_end`, the existing default
   payment method, and the `chargebee_*` metadata copied across. No charge now, first
   charge on the bundle's renewal date.
3. In one DB transaction: repoint the existing row onto the first new sub (guarded on the
   old sub id), insert the second club's seat and subscription row. Verify **zero** rows
   reference the bundle.
4. Only now cancel the bundle, and verify the seats survived on a fresh connection.

A parent with several Stripe customers is a known, handled case — read
`src/services/billing/CLAUDE.md` before touching it; never consolidate customers in Stripe.

## The owner's rulings and settled policies — apply, don't re-ask

- **Once a batch is applied, assume it is correct.** The organizer and support deal with
  families directly and will raise complaints; that loop is the check. Apply the roster as
  given, report what landed, stop. Ask only where the work cannot proceed: a missing DOB, a
  bundle naming no club, a child with no live sub to bind.
- **That removes confirmation questions, not warnings.** Anything that genuinely looks wrong
  is raised unprompted, once, with the evidence: a family billed for a club that has not
  started, a lost discount, a seat with no subscription row, a child paying with no place,
  an access path that cannot work. The owner cannot see what the data shows, so silence is
  never a judgement.
- **Never send password-reset or welcome emails.** Hand over the list of created parent
  accounts; when none were created, say so.
- **Duplicate parent accounts for one child: seat on the account that holds the
  subscription.**
- **Age outside the club's band is fine** unless shockingly off — but when most of a
  cohort is out of band, suspect the product's band and raise it (cross-read the ages in
  the Chargebee plan name).
- **A native sub cancelled soon after signup** is usually a discount-code camp signup, not
  churn — don't seat, just report.
- **A club price change does not move existing subscribers** — they are grandfathered.
  Don't chase the split. The exception worth flagging is a native signup and a migrated
  cohort on the **same club at different prices**.
- **A child's DOB stays as the parent entered it**; never correct it to the roster.
- **Attendance, not billing, settles which club a child is in and whether they churned.**
  Billing records only what a family started paying for. Ask the organizer to check
  attendance. "Club X got combined into Y" never identifies which children moved — one
  product can carry two real-world groups; ask which, don't derive it. A native Sogverse
  checkout is the exception: its metadata is the parent's own choice.
- **"We need to email the family" is a legitimate final answer.** Leave the child unseated,
  the sub untouched; the next batch picks it up.
- **A late payer is handled with trial days**, which moves the sub to `trialing`; the
  webhook maps that to `active`.
- **Never justify a club match by uniqueness of name**, and never list the catalogue
  filtered to one locale — each club's name sits under exactly one locale row, mixed `en`
  and `fi`. Two Sogverse products can share a name; always name a club by weekday and time.

## End-of-batch message to the organizer

Every batch ends with a Slack message the owner pastes. Draft it to a file and put it on
the clipboard UTF-8-safely (€, –, ä reach a real person).

- Open with "this is Claude, writing on behalf of <the owner>".
- Lead with the reassurance that carries the risk — nothing changed, cancelled or
  re-charged in Stripe, every family keeps its price — then who is now enrolled, then new
  logins to mail.
- Write for the organizer: no ids, no table names. Children and parents by name, clubs by
  real name plus weekday and time, prices in €. Use the roster's names even where the DB
  differs.
- **Put the parent's email next to every parent named** (`Child — Parent — email`), and
  call out separately the subset that must be emailed.
- Address the message to customer support with the organizer tagged, split the asks by
  who can settle them (contacting a family vs organizer knowledge), and end with a
  two-line recap of what each owes.
- Close with what is **not** blocked, and don't re-ask anything settled above.

## Other shapes

- **Two guardian accounts for one child, both keeping a login:** move the enrolment, not
  the people — repoint the seat (`gamer_id`, `customer_id`) onto the surviving parent's
  own child record and the subscription row's `customer_id`. Put the **same**
  `stripe_customer_id` on both parents' profiles (clearing it from the payer makes the
  portal mint an empty customer). The surviving parent will see the payer's card and
  invoices, so get the payer's explicit consent through the organizer first.
- **An account created under the child's own email:** seat on the account holding the sub,
  then relabel that one account once the real guardian is confirmed — Admin API `PUT`
  (never SQL: `auth.identities` holds its own copy; `email_confirm: true` suppresses mail;
  GoTrue lowercases), then update `profiles` names and email (nothing syncs it), and leave
  `stripe_customer_id` alone. Check `recovery_sent_at` first — a login already mailed to
  the old address dies with the change.
- **Comping a free visit to a paid club:** never a bare seat with no subscription row
  (it would run free forever). Create a sub on the parent's customer at the club's listed
  price with `trial_end` = the end of the visit and **`cancel_at_period_end: true`** (the
  portal's Renew toggles that flag), with their card as default payment method; seat it
  with status `canceling`. Re-read immediately and cancel on the spot if the flag did not
  stick — it is the only thing between the family and a real charge. The seat then deletes
  itself at trial end unless the parent renews.

## Reading subscriptions correctly

- **`active` does not mean charged — check `pause_collection`.** A break is
  `pause_collection: {behavior: 'void'}`: the sub stays active and every cycle invoice is
  voided at €0. Read the invoice list before claiming a family is paying.
- **Two live subs for one family** are either a managed club move (old sub set to cancel,
  new sub trialing to the old period end, no checkout session on the seat) or a family
  repurchase (a real `cs_live_…`, full price, old sub still running — the actual
  double-billing risk). Check which before raising. Same club twice is usually siblings.
- **A club move re-prices the family** at the destination's list price when the trial
  ends; make sure the family was told.
- **A child missing from a roster seated last batch** is usually a voluntary cancellation
  torn down by the webhook — report it as news, not a defect.
- **A native checkout seat has no `group_id`** — sweep for `group_id IS NULL` after a week
  that mixes checkouts with a batch.
- **A paid club with no `product_subscription_prices` row is normal** — it says nothing
  about whether the club still meets.

## The standing sweep for unbound subs

Nothing ever links a pre-existing sub to a family who self-registers later, and a family
parked for a missing DOB is never re-checked. So re-run this sweep rather than treating
each report as a one-off: **from the Stripe side**, page every live sub (`active`,
`trialing`, `past_due`, `unpaid`, paginating on `--starting-after`) and diff the ids
against `family_subscriptions`. The Sogverse-side query (profiles with no customer and no
seat) finds only families who already registered — 5 where the real number was 26.
Baseline 2026-08-17: 162 live subs, 26 unbound — triage named-club subs first, then
generic bundles (need the organizer), then €0, already-cancelling and paused ones.

## Verification

For every subscriber: the customer on the profile holds the sub, the seat exists, the
subscription row references both, and the parent sees one Manage-billing button that
opens the real subscription. Then the batch-wide checks: zero orphan seats, zero U+FFFD
names.

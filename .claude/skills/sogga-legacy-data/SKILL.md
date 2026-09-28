---
name: sogga-legacy-data
description: Look up data on SOGGA, the old platform Sogverse replaces — its prod Postgres (read-only), its scheduling Google Sheet, and the exact ids that join Stripe, SOGGA/Chargebee and Sogverse records for the same family, child or subscription.
---

# SOGGA, the old platform

SOGGA is a Node/Sequelize API on Azure, billed through **Chargebee**; its paying base was
migrated Chargebee → Stripe in June 2026. It is where a migrated child's real name and
birthdate live, and where the old club assignments are.

## Deterministic join keys — use these before fuzzy email/name/phone matching

- **Stripe → SOGGA:** a migrated Stripe `subscription.metadata.chargebee_customer_id`
  (and `chargebee_subscription_id`) equals SOGGA `chargebee_subscriptions.chargebee_customer_id`
  (and `.chargebee_id`). Migrated subs carry `metadata.source` =
  `chargebee-migration-2026-06` (or its `-trial-` / `-paused-` variants); a live sub with no
  `source` is Sogverse-native. 156 of 181 live subs carried it (2026-06-15).
- **Stripe → Sogverse:** Stripe `customer.metadata.user_id` = Sogverse `profiles.id`. Only
  customers created by a Sogverse checkout carry it, but it is exact — it links even when
  the Sogverse account uses a different email from Stripe and SOGGA.
- **Child's name in Stripe:** only native subs carry `metadata.child_first_name` /
  `child_last_name` / `child_age`. A migrated sub has no child name in Stripe; it lives in
  SOGGA.
- **Mojibake:** a migrated Stripe `customer.name` is often double-encoded (`Ã¤` for `ä`).
  Repair with a latin-1 → UTF-8 re-decode, guarded on the markers `Ã` and `Â`. SOGGA and
  Sogverse store clean UTF-8.

## Prod database access (read-only)

- Server `sogga-sql.postgres.database.azure.com` (Azure Postgres flexible server, PG16,
  North Europe), db `postgres`, port 5432, `sslmode=require`. Dev is `sogga-sql-dev`.
- Fetch the connection string without printing it, from the API app's settings, into a
  temp file, and delete the file after use:
  `az webapp config appsettings list -g sog_gamers_arena2 -n sogga2-api --query "[?name=='DB_CONNSTR'].value" -o tsv > <tmp>`,
  then `psql "$(cat <tmp>)"`.
- **The server blocks unknown IPs.** Without a firewall rule for your address, add one:
  `az postgres flexible-server firewall-rule create -g sog_gamers_arena -n sogga-sql --rule-name <name> --start-ip-address <ip> --end-ip-address <ip>`.
  The database sits in resource group `sog_gamers_arena`, the API app in
  `sog_gamers_arena2`.
- Open every session with `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;` and run
  SELECTs only.

## Data model: Chargebee consumer subscriptions

- **The parent is on the subscription row** (`chargebee_subscriptions.email`,
  `customer_first_name`, `customer_last_name`, `chargebee_customer_id`). Its `user_id` and
  `parent_id` columns are NULL on every row — never join subscription → parent through
  them. Reach the parent's `users` row by `lower(users.email) = lower(sub.email)`.
- **Gamer:** `chargebee_subscription_plans` (up to three per sub) → `.gamer_id` → `users`
  (`first_name`, `last_name`, `birthdate`).
- **Club:** `chargebee_plans.external_name` (Finnish display name) or `.name`; the weekday
  is the name's prefix (`MA/TI/KE/TO/PE/LA`). The club it names can be a rescheduled or
  retired group, so it identifies the child reliably and the current club only loosely.
- The **municipality** flow (`participantParent` / `participantGamer`) is not
  Chargebee-billed; exclude it from anything about consumer subscriptions.

## Data model: gamers

- **Gamers are `users` rows** whose `flags->'Roles'` contains `USER_ROLE_GAMER` (roles live
  in `users.flags`: `USER_ROLE_GAMER/PARENT/GEDU/ADMIN/EXGEDU`). They have no username and
  almost never an email; nearly all have `birthdate`.
- **Parent ↔ gamer:** `user_vs_gamer` (`user_id` = parent, `gamer_id` = child);
  `user_vs_parent` is the inverse.
- **Two product views per gamer:** what was paid for, through
  `chargebee_subscription_plans.gamer_id` → `chargebee_plans`; and what was attended,
  through `participations.gamer_id` → `groups` → `clubs` (`name`, `sku`, `active`).
- **Engagement counters** are `gamer_profile_variables` (`user_id`, `variable_type`,
  numeric value): `478818936255677440` lessons attended, `478819039435555840` Minecraft
  lessons, `478819014705939456` tech lessons, `478819069722625024` esports lessons,
  `478818962402968576` good behaviour.

## The scheduling Google Sheet

SOGGA-era scheduling lives in a Google Sheet (spreadsheet
`1iWjOTCKGJ5fe1HF4H_fu3Epx8x3b2J2Q9uY3PbbW7CA`), read with the service account
`sogverse@sogverse.iam.gserviceaccount.com` (Google Cloud project `sogverse`). `.env.local`
carries `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`; nothing in the repo reads them, so a query is a
one-off script with `googleapis` and the `spreadsheets.readonly` scope.

- Tabs: Muni Clubs 25-26, FIN Consumer Clubs, ENG Consumer Clubs, Repeating Tasks, Game
  Educators, Recruitment Gedus.
- Game Educators holds phone numbers in column I, in mixed formats.
- Club tabs link gedus by name in the "Assigned Gedu" column — a text match, not an id —
  and names disagree between tabs (typos, nicknames, swapped first and last names).
- A club's day and time are free text inside its "Club" column.

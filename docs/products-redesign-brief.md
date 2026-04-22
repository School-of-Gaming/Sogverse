# Products Redesign — Product & Business Brief

**Audience:** Product and business teams. Non-technical.
**Companion to:** `products-redesign.md` (the engineering spec).
**Purpose:** Explain what's changing clearly enough that you can give a go / no-go without reading the full spec. A sign-off checklist at the end pins down the decisions you own.

---

## TL;DR — what's changing

Today the platform supports **one** kind of product: a weekly consumer club paid with Sorg tokens. We're reshaping it to support **four** product types under a single admin flow and a single signup mechanism:

1. **Consumer clubs** — parents pay, ongoing.
2. **Municipality clubs** — city pays, term-bounded.
3. **Camps** — parents pay upfront, short runs (often 2–5 days).
4. **Events** — one-off, free or paid.

Parents get **two separate front doors**: a "shopping for my kid" browse catalog, and a "my city paid for this" registration catalog. They never cross-link.

Under the hood we are also changing some behaviours that affect real-world flows: how waitlists work, when a product actually *starts*, how refunds are handled per product type, and how Gedus are organised into groups. Those are the things most worth your attention.

**Staging only.** No live-customer data is affected. No migration risk for paying customers.

---

## 1. The four product types

| | **Consumer club** | **Municipality club** | **Camp** | **Event** |
|---|---|---|---|---|
| **Who pays** | Parent, ongoing | Municipality, offline | Parent, upfront | Parent upfront, or free |
| **Parent-facing verb** | *Enroll* | *Register* | *Sign up* | *Join* |
| **Schedule** | Recurring, no end | Recurring, term-bounded | Recurring over a few days | One date |
| **Waitlist** | Yes | Yes | Yes | Optional |
| **Refunds** | Per-session window | None (city paid) | Cutoff before start; admin override | Cutoff before start |
| **"Registration opens" moment** | Never (always open) | **Required** (ticket drop) | Optional | Optional |

The four types share ~80% of their operational model (schedule, location, topic, language, age range, Gedus, attendance, notes, voice room). They differ mainly on **who pays** and **schedule shape** — which means we can run all four through one admin flow with a few small switches, rather than four separate systems.

### A note on the name "municipality club"

Internally and publicly the term is **municipality club** — not "school club." These clubs run wherever the municipality asks us to: school computer rooms, libraries, community centres. Anchoring the name to "school" would confuse parents whose club isn't held at a school. Please use *municipality club* consistently in marketing, support, and internal conversation.

---

## 2. Two front doors for parents

Parents never land in one big merged catalog. They arrive via **one of two** top-level paths, and we deliberately **do not** cross-link them:

### Path A — Consumer browse (`/browse`)

The "I'm shopping for my kid" catalog. Contains consumer clubs, camps, and events. Filterable by age, location, language, topic, tags, schedule, price. Includes a help-me-decide quiz. Parents pay with Sorg tokens.

### Path B — Municipality club registration (`/registration`)

The "my city offered this for free" catalog. Contains **only** municipality clubs. Parents search the location tree (e.g. "Helsinki", "Uusimaa", "Ressu School") and land on a page listing muni clubs at or under that location. No price discussion — the municipality has already paid.

### Why they stay separate

A parent on `/browse` is picking a product and paying for it. A parent on `/registration` is claiming a seat their municipality funded for residents. Mixing the two confuses everyone — parents outside the municipality see seats they can't claim, and parents inside the municipality get distracted by paid alternatives. Each page's copy, urgency, and CTAs are tuned for one audience.

**Consequence for marketing:** the two catalogs are separate. Any school announcement, email, WhatsApp link, or poster pointing to muni clubs must link into `/registration`. Anything pointing to paid products must link into `/browse`. Crossed wires will confuse parents.

---

## 3. What parents see — and what they don't

### They see

- The product: name, description, image, topic (e.g. Minecraft), tags (chill / competitive / neurodiversity-friendly / …), age range, language, the Gedu(s) running it, the schedule.
- **Honest seat state** — "8 of 10 seats · 3 on waitlist." We surface the waitlist count on purpose; no "register and find out" surprises.
- **Upcoming sessions, with skipped dates surfaced** — "No session on Dec 24, Dec 31 — Christmas break."
- For in-person products: the venue plus any access notes (e.g. "Room 204 · entrance via back door after 5pm").
- For products waiting to hit a signup threshold (see §5): a live "5 of 8 spots needed to start" indicator.
- For municipality clubs with a ticket drop: a live countdown to the open moment, with a pre-filled form ready to submit the instant it opens (see §6).

### They don't see

- **Gedu Groups.** When an admin organises participants into multiple cohorts inside a product (e.g. "Adam's group" and "Bob's group" both running on Tuesdays), parents see a single product with a combined seat count. Which group their child ends up in is an admin decision, made after signup. This is deliberate — parents pick the product, we handle the internal cohort layer.
- **Seat/price calculations for free products.** A free product with unlimited seats shows as "all welcome" — never as "? of ? seats" or a blank number.

---

## 4. Gedu Groups — the admin cohort layer

Groups are kept from today's system, but generalised to all four product types. A group is an admin-facing container inside a product:

- An admin can create 0, 1, or many groups per product.
- Each group has a name ("Adam's group", "Tuesday 17:00 A", "Beginners") and 0 or more Gedus assigned to it.
- Capacity lives on the **product**, not on groups — admins balance participants across groups manually via drag-and-drop.
- When a parent signs up, the participation lands in an **"unassigned inbox"** on that product. Admins then drag the gamer into a real group.
- For online products, each group has its own voice room. Gamers only see their own group's room. **Gedus can hop between sibling groups' rooms within the same product** — this solves "Adam steps out for 10 minutes, Bob pops in to cover."

### What this enables

- Admins can advertise a camp with 100 seats, wait to see how many sign up, *then* decide on 1, 3, or 4 groups based on actual demand.
- "Bob covers for Adam" is a natural cross-group voice-room hop, not a schema gymnastics move.
- Empty groups (structure first, people later) and empty assignments (people first, no Gedu yet) are both valid, so admins aren't forced into an order.

### One rule worth knowing

A Gedu is on **at most one group per product.** They can be on multiple different products simultaneously — just not two groups of the same product. Cross-group coverage is handled via the voice-room hop, not via standing double assignments.

---

## 5. When a product actually starts — the three start modes

This is **new behaviour** worth examining carefully.

Today, products just start on their start date. Going forward, admins pick one of three start modes when they create a product:

1. **On a specific date.** Classic case. Runs on that date regardless of headcount.
2. **On a specific date, only if enough sign up.** Scheduled for the date; cancelled (and refunded, if paid) if a minimum signup count isn't reached by then. Parents see both the date *and* a live "X of Y needed" counter.
3. **When enough gamers sign up.** No fixed start date. Admin picks the date once the threshold is met. Parents see only the counter and are told we'll contact them when ready.

Not every product type offers every mode:

| Product type | Available start modes |
|---|---|
| Consumer club | All three |
| Camp | Modes 1 and 2 (camps are calendar-tied) |
| Event | All three |
| Municipality club | Mode 1 only (fixed by the school calendar) |

### Admin-controlled, not automatic

**Products do not auto-start when their threshold is met.** The system notifies the admin ("Tuesday Minecraft has 8 signups — ready to start"), and the admin clicks Start when they're ready. They can also start under threshold (one confirm dialog: "Start with 7 instead of 8?") or keep waiting indefinitely. There's no automatic cut-off.

### What parents see during this waiting period

On a product that's threshold-pending, the parent sees "5 of 8 spots needed to start." This is honest about the uncertainty and creates a motivational signup loop — but it does not promise a specific start date.

### Cancellation refunds

If an admin cancels a threshold-pending product (because the count didn't hit in time), **all upfront-paid participations are automatically refunded in full.** Checkout copy for camps and paid events will say this explicitly: *"Fully refunded if we can't run this."*

---

## 6. The ticket-drop experience for muni clubs

Municipality clubs have a **required** "registration opens at" moment — the ticket drop. Before that moment, the signup form is visible but disabled, showing a live countdown ("Opens in 2 days 14:32:08"). The form is **pre-populated** (gamer picker, rules checkbox) so the instant it opens, registration is one click.

The product team already validated this during mockup review (comparing it favourably to Taylor Swift concert ticket drops). Treat the countdown as **required**, not a nice-to-have. It is the key piece of muni-club UX.

**Layout promise:** when the countdown flips to "Open now," the submit button, gamer picker, and rules checkbox **do not shift position**. A fast parent clicking where the button was a second ago will not miss.

**Consistency promise:** wherever a ticket-dropping product appears (detail page, cards on the location page, cards in the consumer browse if applicable), the countdown is live — not a stale "Opens soon" pill. One component, one source of truth.

---

## 7. Billing & refunds at a glance

| Product type | Billing mode | Paid when? | Refund rule |
|---|---|---|---|
| Consumer club | Per session | Weekly, in Sorg tokens | Full refund if cancelled >24h before the next session; otherwise nothing. (Same rule as today.) |
| Camp | Upfront | At signup, one-time Sorg debit | Full refund if cancelled before a per-product cutoff (e.g., "7 days before camp"). Admin can override and refund after the cutoff. |
| Paid event | Upfront | At signup | Same cutoff-based rule as camps. |
| Free event | Free | N/A | N/A |
| Municipality club | Offline (city pays us directly) | N/A for the parent | None — the parent never paid anything to refund. |

### No "accidentally free" products

A product cannot be free just because someone forgot to fill in the price. The admin must **explicitly pick "free"** as the billing mode. Publishing a free product triggers a confirmation dialog. This prevents a whole class of "oops, we gave this away" mistakes.

### Forward-looking note

Eventually we want municipalities to pay inside our system (purchase orders, per-seat invoicing, a coordinator dashboard). **That is out of scope for v1.** For now, muni billing stays fully offline — we invoice them the way we do today. The design leaves room for this to land later without a rewrite.

---

## 8. Online vs in-person — and where muni clubs fit

Every product is either in-person or online. A voice room (Daily.co) exists only for online products.

For location rules:

- **In-person products (any type)** — must pick a physical venue.
- **Online municipality clubs** — must pick a **municipality, region, or country** (not a venue). A muni club is jurisdiction-scoped by definition: the city paid for it, so it shows to parents from that city. The club may be online, but it's still "Helsinki's club."
- **Online consumer clubs, camps, events** — no location anchor. They surface globally under "online" filters, not under any particular city.

Parents in Helsinki searching the `/registration` page for "Helsinki" will see both in-person Helsinki muni clubs *and* online-but-Helsinki-scoped muni clubs in one list. This reflects how parents think about it: "my city offered this, even though it's online."

---

## 9. Residency for muni clubs — honour system in v1

Municipality clubs are only for kids who live in the owning municipality. The city funded those seats on that understanding.

**v1 does not enforce residency at signup.** All muni-club parent-facing copy states the rule explicitly ("only open to kids living in [town]"), but the honour-system copy is the only check. If abuse materialises, we can add residency gating later without a redesign — the data model already carries the jurisdiction.

If you think enforcement is a launch requirement rather than a later phase, flag it now — it's the kind of decision it's expensive to reverse after go-live.

---

## 10. Topics and tags (no more "game")

We're retiring the "game" concept as a first-class field. In its place:

- **Topic** — the subject of the product. One per product. Can be a game (Minecraft, Fortnite, Pokémon GO) or a subject (Game Design, Online Safety, Coding for Gamers). Topic pickers and browse surfaces group "Games" and "Subjects" separately, but under the hood it's one flat list.
- **Tags** — descriptors for filtering (chill, competitive, neurodiversity-friendly, beginner, advanced). Controlled vocabulary, many per product.

**Admins can add new topics and tags inline during product creation** — no separate admin trip required. The first admin to want "Among Us" as a topic can add it without leaving the form, and it's immediately available to every future product.

---

## 11. Cancellation & capacity mechanics (behaviours to verify)

A few behaviours are worth naming explicitly so the product team can check they match expectations:

- **Waitlist promotion.** When an active participant cancels or is removed, the person at the top of the waitlist is automatically moved into the freed seat.
- **Cancellation wipes the row.** When a customer or admin cancels a participation, we **delete** the record rather than marking it "cancelled." If the parent re-signs up later, a fresh record is created. **Implication:** there is no internal audit trail of cancellations; outbound emails (the signup and cancellation confirmations we already send) are the record. If you need an audit trail for reporting later, we can add one — it's not built now.
- **Admins can refund outside the normal window.** If a family hits a hardship and the normal refund cutoff has passed, an admin can still issue a full refund with one action. Normal customer-facing cancellation respects the cutoff; admin override bypasses it.
- **"Unlimited seats" is only for free products.** A paid product with no seat ceiling is a billing footgun we don't support. If an event is free, seats can be unlimited. If money moves, there must be a seat count.

---

## 12. Admin experience (high level)

- **One "Create product" form** with a type selector. Fields that aren't relevant to the chosen type (e.g. end-date on a consumer club, venue on an online event) hide themselves.
- **Groups panel** per product: an "Unassigned" inbox column plus one column per group, drag-and-drop to move gamers between them.
- **Gedu picker** with language filter (essential — we have 30+ Gedus; a flat dropdown is unusable when the admin is staffing a Swedish-language club).
- **Calendar view** per product, with cancel / reschedule / substitute Gedu available from the same calendar.
- **Holiday calendars** are managed centrally; products subscribe via multi-select (so "add a holiday to Espoo schools" updates every subscribed product at once).
- **Admin home highlights threshold-hit notifications** ("Tuesday Minecraft has 8 signups — ready to start") so admins aren't polling every product page.

---

## 13. What's explicitly NOT in v1

These are deliberately deferred. Please flag if any of them feels like a v1 must-have rather than a later phase:

- **On-platform municipality billing.** No coordinator portal, no PO uploads, no per-seat invoices inside the system. Invoicing stays offline. (Phase 4.)
- **Residency enforcement for muni clubs.** Honour-system copy only. (Phase 5, if needed.)
- **School-code gating** (parent enters a code to unlock a specific school's clubs). (Phase 5, if needed.)
- **Attendance-driven removal.** We'll track attendance; we won't auto-remove gamers for repeated absences. (Phase 3.)
- **Substitute-Gedu auto-suggestions.** Admins manually pick a substitute Gedu in v1. (Phase 3.)
- **Municipality reporting dashboards** (attendance, retention per cohort). (Phase 3.)
- **Sibling multi-gamer signup flow.** Parents sign each child up individually in v1. (Phase 3.)
- **Term / season templates** (clone a whole semester forward). (Phase 3.)
- **Promo codes, first-session-free, intro discounts.** (Phase 3.)
- **Parent "all my kids' sessions this week" calendar view.** (Phase 2+.)
- **Automatic scheduling-conflict prevention** when an admin accidentally puts a Gedu on two overlapping products. Admin discipline in v1; system check later.

---

## 14. Things that could surprise someone — worth verifying

Flag any of these as unacceptable *before* we build, not after:

- **Cancellations wipe the record rather than marking it cancelled.** No cancellation audit trail internally. Email receipts are the trail. (§11)
- **Products don't auto-start when their threshold is met — an admin must press Start.** This means a product could sit at 8/8 for days if an admin isn't paying attention. The notification is the mitigation. (§5)
- **Threshold-pending products show parents "5 of 8 needed to start" without promising a date.** Some parents will ask "when will it actually start?" and we'll honestly not know. (§5)
- **Paid camps and events cancelled pre-start refund everyone automatically.** We are committing to this being reliable. Finance / support should know this is the guarantee we're making in checkout copy. (§5, §7)
- **Gedus can silently be double-booked across products on overlapping times.** The system won't warn an admin who puts a Gedu on Monday-17:00 Minecraft and Monday-17:00 Fortnite camp. (§13)
- **Online muni clubs pick a jurisdiction (city/region), not a venue.** An admin who expects "pick a school" for an online muni club will be confused until they read the label. Worth confirming the admin UX copy explicitly teaches this. (§8)
- **"Municipality club" will replace "school club" everywhere.** Marketing, support scripts, and any existing partner-facing collateral will need updating. (§1)
- **Gedu Groups are completely invisible to parents.** If anyone expected parents to self-select a group (e.g., "Adam's group vs Bob's group"), they won't. Parents pick the product; admins assign the group. (§3, §4)

---

## 15. Sign-off checklist

Please confirm each item before we build. A "no" on any of these should block the go-ahead and start a conversation.

**Product scope**
- [ ] The four product types (consumer club, municipality club, camp, event) are the right set for v1.
- [ ] Parent-facing verbs — *Enroll / Register / Sign up / Join* — match the tone we want per type.
- [ ] The term **"municipality club"** (not "school club") is the name we want used in marketing, support, and UI.

**Discovery & catalog**
- [ ] Two separate front doors (`/browse` and `/registration`) with **no cross-links** is the right split.
- [ ] Municipality clubs are excluded from `/browse`, the help-me-decide quiz, and topic landing pages — they only appear on `/registration`.

**Parent experience**
- [ ] Parents should see waitlist counts honestly ("8 of 10 seats · 3 on waitlist").
- [ ] Gedu Groups should stay invisible to parents (parents see the product, not the cohort).
- [ ] The ticket-drop countdown for muni clubs is a required part of the experience.

**Start modes & cancellation**
- [ ] The three start modes (fixed date / fixed date with threshold / threshold-only) cover all the cases we need.
- [ ] It is acceptable that a product does not auto-start when the threshold is met — the admin must press Start.
- [ ] Automatic full refunds on admin-cancellation of paid products (pre-start) is the policy we're committing to in checkout copy.

**Billing**
- [ ] Per-session for consumer clubs, upfront for camps & paid events, offline for muni clubs, explicit "free" opt-in for free products is the right set.
- [ ] On-platform municipality billing can wait for a later phase — offline invoicing is fine for v1.

**Residency**
- [ ] Honour-system copy ("only open to kids living in [town]") with no v1 enforcement is acceptable for muni clubs. (Flag now if you want enforcement at launch.)

**Deferred scope**
- [ ] The list in §13 ("What's explicitly NOT in v1") is acceptable. Nothing on that list is a launch blocker.

**Risks**
- [ ] The surprises in §14 ("Things that could surprise someone") are known and accepted.

---

## 16. Where to look next

- **Mockups to click through** (on `feature/school-clubs-mockup`):
  - Parent browse: `/browse-mockup`
  - Muni registration: `/registration`
  - Admin create-product: `/admin-mockup/products/new`
- **Full engineering spec:** `docs/products-redesign.md` (1,000 lines — only if you want the schema, RPC, and RLS detail).
- **Questions on this brief:** direct them to Kyle.

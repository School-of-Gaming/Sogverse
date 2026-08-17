# Municipal Enrolment Platforms (Lyyti, Hellewi)

Point-in-time investigation record, 17 August 2026. **No Sogverse code exists for any of
this and nothing has been decided** — this is the state of what we know so a later session
can pick the question up without re-running the research.

**The question:** Finnish municipalities run their funded hobby clubs — the ones we
deliver — on third-party enrolment platforms. Can we talk to those platforms, so that a
family either enrols through Sogverse, or at least shows up in Sogverse once they have
enrolled through the municipality?

Two platforms are in scope. Tampere runs **Lyyti**; a wider set of municipalities runs
**Hellewi**.

---

## The constraint that dominates both

**The clubs live in the municipality's tenant, not ours.** Whatever the API can do
technically, a write is us inserting rows into a city's registration system, and that is a
conversation with the municipality's coordinator before it is an engineering task. Read
access is the cheap, low-risk half in both platforms and is where to start.

Three consequences that apply to either vendor:

- **The registration form is the municipality's, and it carries their questions** —
  guardian details, accessibility information, consents, custom fields. An API-created
  registration means the family never sees that form, so every question on it has to be
  collected in Sogverse and mapped onto the platform's field ids. Anything unmapped is
  silently not collected. **This mapping is the real work in a write integration; the HTTP
  call is the easy part.**
- **A write integration owns its own failure modes.** A half-landed registration is a
  child who believes they have a place and does not, in a system we cannot see the truth
  of. A read integration cannot corrupt the municipality's roster at all.
- **Per-vendor connectors do not scale.** Two vendors today and a third whenever a new city
  signs. If this proceeds past one integration, it wants one internal enrolment-source
  abstraction with thin per-vendor adapters, not two bespoke integrations.

**Read direction (recommended starting point):** pull the municipality's course/event
catalogue and our own groups' participant lists into Sogverse, and reconcile them against
gamer/participation records, so a family who registered through the city appears in My SOG
without anyone re-keying them. One-way, same credentials, nothing we write can break.

---

## Lyyti — Tampere

Finnish event-management platform. Tampere's hobby clubs are in its **Harrastuskalenteri**,
the Lyyti instance behind *Lupa liikkua / Lupa harrastaa*.

### Account model

- **Organisers have logins; participants do not.** A registrant is a row identified by
  email. After registering they get a confirmation mail containing a **personal link** back
  to their own registration page, which is how they edit or cancel. There is no participant
  account and no per-family credential for us to create, manage or ask for.
- Events can be gated by an access code or use personal invite links — neither is an
  account. In Tampere, `Lupa liikkua` groups are code-gated; `Lupa harrastaa` and `Lupa
  treenata` are open to all.
- A hobby provider (*toimija*) creates and manages **its own** groups and registrations in
  Lyyti, and gets its Lyyti credentials **from the Lupa liikkua Lupa harrastaa
  coordinator** — so a provider seat sits inside the city's account.

### API (public documentation, `lyyti.readme.io`)

- **Root:** `https://api.lyyti.com/v2`.
- **Auth:** HMAC. A public/private key pair, sent as
  `Authorization: LYYTI-API-V2 public_key=…, timestamp=…, signature=…`, where the signature
  is a SHA-256 HMAC over those fields plus the call string, keyed with the private key.
  Official PHP wrapper and Python examples exist.
- **A UI username/password is not API access.** There is no password grant and no token
  exchange from a UI session — the seat credential and the API credential are different
  things.
- **Getting keys:** an *admin* user of the account requests them from Lyyti support
  (`help@lyyti.com` per their help centre); they are delivered in two parts, one by email
  and one by SMS. Keys are **account-level**, not per-event, and are issued **read-only or
  with write access** — a read-only key lists events fine and then fails the participant
  push with `403 write access denied`.
- **Reads:** `GET /events`, plus the participants endpoints for rosters.
- **Writes:** `POST /participants/{event_id}` inserts participants into an existing event.
  Notable behaviours:
  - All fields are optional — posting an empty body creates an empty participant.
  - Payload shape depends on the event's registration type: individual, companion (*Avec*),
    or group.
  - Query params `check_capacity`, `check_unique`, `enable_timer`.
  - **A posted participant is not saved until they confirm by mail unless `saved: true` is
    passed.** A server-to-server enrolment has to set this deliberately.
  - Per the docs, question-capacity checking is not implemented.

### Tampere-specific facts

- Registration for the 2026–27 season opens on fixed dates at 18:00 — grades 1–4 on
  17 August 2026, grades 5–9 on 18 August 2026. An API enrolment path bypasses the queue
  everyone else is in, which is a political question as much as a technical one.
- The code-gated vs open split above has to be respected by anything we build.

---

## Hellewi — the wider municipal footprint

Course-and-hobby enrolment product by **Wildfrost Oy** (Helsinki, part of Hilla Group Oyj).
Search results routinely conflate it with Visma's InCommunity/Wilma — **that is wrong**,
they are unrelated products. Wildfrost claims 300+ organisations, 100,000+ courses/events
and 1M+ participants a year.

### Footprint

Hellewi is the enrolment front door for kansalaisopistot and *Harrastamisen Suomen malli*
in Rauma, Nurmes, Hämeenlinna, Rautjärvi, Sievi, Siikalatva and Seinäjoki among others.
This is a genuinely wider municipal footprint than Lyyti for our use case: Lyyti is an
events platform that Tampere happens to run its hobby calendar on, whereas Hellewi *is*
hobby enrolment as a product.

**Hellewi is not a route into Tampere** — Tampere is on Lyyti. (Tampereen Kesäyliopisto is
a Hellewi customer, but that is a different organisation from Tampereen kaupunki.)

### API — what is verified

- **JSON over HTTP, authenticated with JWT.**
- **Documentation exists but is not public.** No developer portal; the docs come with the
  customer relationship. Wildfrost runs a Microsoft Teams channel where integrators get
  direct support, and an integrator who has used it describes the documentation as good.
- **Confirmed production use is a read:** Tampereen Kesäyliopisto pulls its entire course
  catalogue out of Hellewi as JSON and renders it on its own site, cached on the consuming
  end.

### API — what is NOT established

**Whether a registration can be created through the API.** Every integration findable in
public is a catalogue read. Hellewi markets integrations with accounting, payroll,
payments, room booking and Stripe, all of which are plausible as read-or-export flows. The
docs are private, so absence of evidence is not evidence of absence — but it is not
confirmed, and it should not be assumed. **This is question one for Wildfrost.**

---

## Comparison

| | Lyyti | Hellewi |
|---|---|---|
| Vendor | Lyyti Oy | Wildfrost Oy (Hilla Group) |
| Docs | Public (`lyyti.readme.io`) | Private, via vendor |
| Auth | HMAC public/private key pair | JWT |
| Read catalogue / roster | Documented | Confirmed in production |
| **Create a registration** | **Documented endpoint** | **Unknown** |
| Municipal footprint for hobby clubs | Tampere | Broad (kansalaisopistot + Suomen malli) |
| Whose tenant the clubs sit in | Municipality's | Municipality's |

---

## Open questions

1. **Which Lyyti account do our credentials belong to?** SOG's own Lyyti, or a toimija seat
   on Tampere's Harrastuskalenteri? Everything else forks off this. Tells: the organisation
   name shown after login, whether a user-management/settings area is present (i.e. whether
   we are an admin, which Lyyti requires before issuing API keys), and whether the Tampere
   club events appear as editable.
2. **Does Hellewi's API support creating enrolments?** Ask Wildfrost directly, or via a
   municipal contact.
3. **Which municipalities are actually in play beyond Tampere,** and what does each one run?
   The vendor split above is assembled from public pages, not from our own club list.
4. **Read-only or read-write as the goal?** They are different products for the family: one
   removes re-keying for staff, the other moves the enrolment moment into Sogverse and
   requires the municipality's blessing plus the full form-field mapping.

## If this proceeds

Platform credentials go in `.env.local` alongside the Supabase/Stripe/Daily secrets
(gitignored), read through `process.env` — e.g. `LYYTI_PUBLIC_KEY` / `LYYTI_PRIVATE_KEY`.

## Sources

- Lyyti API — <https://lyyti.readme.io/docs/basics>,
  <https://lyyti.readme.io/docs/authentication-and-authorization>,
  <https://lyyti.readme.io/reference/participants-post>,
  <https://lyyti.readme.io/docs/event-registration-types>
- Lyyti help centre — editing and cancelling participation; automatic confirmation email;
  open vs personal registration link (`help.lyyti.com`)
- Tampere — <https://opi.tampere.fi/lupaliikkualupaharrastaa/toimijat/lyyti/>,
  <https://lyyti.fi/e/cal/lupa-liikkua-lupa-harrastaa.html>
- Hellewi — <https://www.hellewi.fi/en/>,
  <https://mikrogramma.fi/portfolio/tampereen-kesayliopiston-hellewi-rajapintaintegraatio/>
- Harrastamisen Suomen malli —
  <https://harrastamisensuomenmalli.fi/en/for-organizers/municipalities-in-the-finnish-model-for-leisure-activities/>

# Chat wire-up: persisted messaging in the scheduled voice rooms

**Status: decided and ready to build (owner, 2026-09-01; challenge + failure-mode +
cold-read reviews triaged with the owner the same day).** One plan, one branch, one
merge. This plan supersedes and absorbs `docs/investigations/chat-overhaul.md`, which is
deleted; the UI-side contract lives in `src/components/chat/CLAUDE.md` and is *kept*, not
restated here — read it before starting, because several steps below exist only to honour
obligations that file records (they are called out where they bind).

## Problem

The persisted-chat surface is built, signed off and fixture-only: the components in
`src/components/chat/` render at `/preview/chat/session` against mock data, while the
voice rooms still run the old ephemeral chat (`src/components/voice/ChatPanel.tsx` over
Daily app-messages — text-only, no history for late joiners, no moderation, nothing
persisted). Instant rooms share that old panel and are decided to lose chat entirely.
Until the wire-up lands, the signed-off design serves nobody and the old chat's known
gaps (no moderation controls at all, in rooms full of children) stay live.

## Scale

Every scheduled voice session — a session room is ~a dozen people, largely children, with
a gedu moderating. Chat rows are a rounding error (~0.5 KB/message with indexes; 100
chatty sessions/week ≈ 1.3 GB/year of DB disk). Images set the real rate: a normalized
photo runs ~200–600 KB, so a chatty reality (~30 images/session) is ~80 GB/year per 100
sessions/week against Supabase Pro's included 100 GB (shared with session-report photos),
then ~$0.021/GB·mo beyond; a quieter reality (~3 images/session) is ~8 GB/year. Egress
stays inside the included 250 GB/month at these rates. Capacity therefore never *forces*
deletion at any plausible scale — which is what makes keep-everything a viable v1 (see
Retention below). Revisit with real send-rate data once v1 has run.

## The decision

Wire the signed-off chat surface into the **scheduled** voice rooms, replacing the
app-message chat outright, with messages in our own Postgres and Supabase Realtime as
transport. **Buy nothing**: Supabase + our own components. One branch delivers the whole
feature — text core, moderation, reactions, replies, mentions, typing indicator, and
images — and removes chat from instant rooms in the same change. Build order inside the
branch is sequenced so gamer-sent images never exist before the moderator delete control
does (trivially satisfied here: hide ships steps before images).

The behavior was decided in the owner interview (2026-08-31) and the design sign-off
(2026-09-01); the components already encode it. The wire-up's job is to keep the
contract: **transport-free components, props in, intentions out** — the voice room
supplies a container that holds the query, the subscription and the service, and renders
`ChatView` exactly as the preview scene does.

### Decisions settled at planning time (owner, 2026-09-01)

- **Retention: keep everything, delete nothing, v1 has no deletion mechanism.** No reap,
  no cron job, no Daily webhook. Rows and image bytes persist indefinitely, which also
  keeps chat staff-reviewable after the fact — an incident reported that evening still
  has its record. Physical deletion is a privacy decision with its own number, tracked
  as the approved `TODO.md` item ("Chat retention"), which also carries the
  mechanism-candidates analysis so it is not re-derived.
- **The read rule stays, as a time bound in the membership function.** Family
  participants can read a channel only around its own session window; admins and the
  product's assigned gedus have no time bound (staff review is the point of keeping the
  bytes). The app's UI never shows old chat anyway (each session window has its own
  channel, and the room is only joinable in its window) — the time bound exists because
  **the RLS SELECT policy is the real read boundary**: any group member's own logged-in
  account can query PostgREST directly, and without the bound that path exposes every
  past session's log, including chat from before that member joined the group.
- **No rate limiting, anywhere — backend or UI.** Simplicity for v1; added later if real
  usage shows the need. This supersedes the investigation's send-RPC sliding window and
  the sign-off's "design the composer's slow-down refusal state" item — that state is
  now moot and is not built. The accepted consequence is recorded under Rejected
  alternatives so the surface it leaves open is a known decision, not an oversight.
- **The `chat-images` bucket is private, read through signed URLs.** No public URLs at
  all (see Images below). The unlisted-public precedent exists for session photos only
  because report *emails* must GET with no cookies; chat has no email consumer, and the
  owner declined to inherit the public posture without the reason.
- **The EXIF/GPS strip is enforced server-side, for chat uploads *and* the existing
  session-photo route.** The upload routes re-encode through `sharp`, so the strip is a
  mechanism no modified client can bypass — required for chat, where the uploader is any
  child or parent rather than trusted staff, and extended to the session-photo route so
  the guarantee is uniform (owner request). Server-side re-encode also makes the stored
  image dimensions server-measured truth.
- **Hidden-body wire exposure: accepted.** A hidden message's body still travels to
  every realtime subscriber and the moderator-only dimmed view is a client-side split.
  Everyone present received the body before it was hidden; the exposure protects only a
  late joiner reading deleted text out of network traffic with devtools. Accepted as a
  known property — documented in the chat `CLAUDE.md` when the wire-up lands, never
  claimed otherwise in safety copy. (Hidden *images* are stricter for free: the private
  bucket's policy stops non-moderators minting fresh URLs the moment a message is
  hidden; only an already-minted URL survives, until its expiry.)

### Schema (one migration, shaped for the second surface)

A future DM or staff channel extends this by adding an enum value and a membership
branch — one thin table and one enum, not a framework.

- **`chat_channels`** — `id` PK, `type` (new enum `chat_channel_type`, one initial value
  `group_session`), `group_id` FK → `product_groups`, `session_opens_at timestamptz NOT
  NULL`, `session_ends_at timestamptz NOT NULL`, `created_at`. Unique on
  `(group_id, session_opens_at)` — the same key `voice_private_zone_occupants` uses for
  the same "a room is keyed by its session window" reason. **Deliberately no FK to
  `group_sessions` and no call to its ensure function**: that function is
  `service_role`-only with no guard in its own body — today it is safe purely because
  every caller is a staff-gated RPC, and a participant-callable chat RPC reaching it
  would be the first non-staff path into it, manufacturing phantom session rows that
  surface as blank cards in gedu/admin feeds, a permanent `created_by` stamp naming a
  child, and unclearable "report owed" badges after schedule edits. Both window instants
  are **derived server-side** from the product's schedule at materialization (never
  accepted from the client — they feed the read bound, so a client-supplied value would
  let a member mint themselves an arbitrary read window) and snapshotted, never
  re-derived. Staff tooling that wants to relate a chat log to a session report joins on
  `(group_id, date of session_opens_at in the product's timezone)`.
- **`chat_messages`** — `id` PK (client-supplied UUID, so the optimistic echo reconciles
  by identity), `channel_id` FK, `sender_id` FK → `profiles`, `body text` nullable,
  `image_width`/`image_height` (`integer`, both null or both set, each
  CHECK-bounded to the normalize pipeline's maximum edge; values are server-measured —
  see Images), `reply_to_message_id` nullable self-FK, `created_at`, `edited_at`
  nullable, `hidden_at`/`hidden_by` nullable (soft delete — moderator or self; same
  tombstone either way). CHECK: text XOR image (exactly one of `body` / the image pair
  present). CHECK: **the character cap itself, measured on the display form** —
  `char_length` of the body with `@[Name](id)` mention tokens `regexp_replace`d back to
  `@Name` is ≤ 500 (`regexp_replace` is immutable, so this is a legal CHECK). The
  constraint owns the cap; the RPC does not re-measure. A flat cap on the stored string
  is forbidden — it would refuse exactly the messages that name the most people (the
  constant's header in `src/lib/constants/chat.ts` states this contract; there is no
  separate backstop number to drift from it). The image object's name in the bucket is
  the message `id` (the session-images "row PK is the object name" pattern), so there is
  no path column.
- **`chat_reactions`** — PK `(message_id, sender_id, code)`, `message_id` FK,
  `sender_id` FK, **`channel_id` FK NOT NULL** (denormalized on purpose: a
  `postgres_changes` filter is one column, and without it every reaction in the project
  fans out to every subscriber and a channel's reactions can only be read via a
  200-element `IN` list), `code text` CHECK-constrained to the approved set (mirroring
  `CHAT_REACTION_CODES` in `src/lib/constants/chat.ts` — the DB stores the code, never
  raw emoji), `created_at`.
- **`chat_channel_locks`** — `(channel_id, user_id)` PK, `locked_at` nullable,
  `locked_by`, `updated_at`. **Unlock is an UPDATE (`locked_at → NULL`), never a
  DELETE**, so both directions replicate without touching `REPLICA IDENTITY`.
- **Realtime publication**: `chat_messages`, `chat_reactions`, `chat_channel_locks` all
  join `supabase_realtime` (each needs its own `ALTER PUBLICATION` line). A lock landing
  mid-conversation must arrive live, not on refetch. `chat_reactions` needs
  `REPLICA IDENTITY FULL`: an un-reaction is a DELETE, and a `channel_id`-filtered
  subscription can only receive a DELETE whose old row carries the filter column.
  Messages and locks are never deleted (soft delete and unlock are UPDATEs), so both
  keep default identity. **Publication membership appears nowhere in `schema.sql` and
  is asserted by no existing check — a table missing from it degrades silently and
  totally** (everyone's own echo works; nothing else arrives). So the schema step
  includes a DB test asserting the three tables' publication membership and intended
  replica identity — the cheapest correctness-by-mechanism win in the plan.
- **RLS**: enabled on all four tables. Genuine SELECT policies — required because
  Realtime `postgres_changes` respects RLS and the subscriber reads the tables
  directly — scoped through the membership function (next section). **Lock rows are the
  exception: readable only by moderators and by the locked person themselves** — a
  channel-wide read would broadcast live to every child that a gedu silenced a
  particular child, and the UI needs no more than own-row + moderator reads (the lock
  switch is moderator-gated; the locked viewer needs only their own state). No
  INSERT/UPDATE/DELETE policies and no write grants: every write goes through a guarded
  RPC. Every new object gets its explicit per-role `GRANT` (no Data API access by
  default). "No write grants" means `authenticated`/`anon`; the db-test suite
  fabricates rows the RPCs cannot produce (an expired channel for the time-bound
  test) through its established direct connection, per `tests/CLAUDE.md`.
  `hidden_by` is audit-only — nothing in the UI reads it; it exists for the psql
  review path, where "who removed this" must be answerable.

### Membership and authorization

One **per-type membership function** answers "who can see this channel" — the seam every
later channel type extends. For `group_session` channels it **composes the two
predicates the voice tables already ship** rather than restating their branches:
`is_voice_group_member(group_id)` (admin, or active participation in the group — gamer
and parent seats through one query — or gedu assigned to the product) is the admit list,
and `is_voice_group_moderator(group_id)` (admin or assigned gedu) is the staff half. The
chat shape:

```
member := is_voice_group_member(g)
          AND (is_voice_group_moderator(g) OR now() < channel.session_ends_at + <grace>)
```

The grace is **a SQL literal, named as chat's own number** — the voice window margins
are TypeScript constants SQL cannot see, and a security boundary silently drifting from
an app constant is worse than an honestly duplicated number (the db-authorization doc
records this exact ruling for the occupancy prune). Choose it comfortably longer than
the voice token's own post-window grace, on the order of an hour: React Query refetches
on window focus, and a parent re-focusing the tab just past the bound must not watch the
log blank while the room is still winding down.

All writes are **SECURITY DEFINER RPCs, guard-first, classified in the DB test suite's
authorization spine** (follow `docs/architecture/db-authorization.md`). The guards must
mirror `src/components/chat/capabilities.ts` exactly — that module is the spec, per the
moderation-symmetry ruling: **per-person moderation acts (hide/restore) are symmetric —
any moderator may act on anyone's message, fellow moderators and admins included; the
lock is not — a moderator cannot lock another moderator.** A UI offering what the server
refuses (or vice versa) is the defect this pairing prevents. Moderator = positive
allow-list, never an exclusion.

The RPC surface (nine):

- **`ensure_chat_channel(group_id)`** → the current window's channel row. Guard:
  `is_voice_group_member`. Finds the group's currently-open session window from the
  product's schedule server-side and materializes the channel idempotently — insert
  `ON CONFLICT DO NOTHING`, reselect on conflict, the established pattern. Called by
  the voice-room container on mount. **The window search is a real work item, not a
  call to something that exists**: the date-keyed SQL window function applies no
  margins and the full occurrence search (with its DST-safe adjacent-day probe) lives
  only in TypeScript on the voice token route. The RPC gets its own PL/pgSQL
  implementation — composing the existing date-keyed function inside a candidate-date
  probe is fine — with the join margins as SQL literals, **holiday-blind to match the
  voice path** (the token route consults no holiday calendar; chat inventing holiday
  awareness would be new behaviour, not a port). This deliberately duplicates window
  arithmetic the db-authorization doc once declined to duplicate for the occupancy
  prune — that ruling stands for its own case (the payoff there was low); here the
  duplication is the price of a participant-callable guard, paid knowingly. Two
  consequences to build in: **a db test pins the SQL windows against the same fixture
  schedules the TypeScript session-schedule tests use**, so the two implementations
  cannot silently disagree; and when they disagree anyway at a boundary instant, the
  failure mode is the container's chat-unavailable state (below) — never a channel
  keyed to a different window than the room.
- **`get_chat_channel_roster(channel_id)`** — membership-scoped read returning
  `(id, first name, role)` for **the group's active seat-holders, the product's
  assigned gedus, and everyone who has a message in the channel**. That last clause is
  what keeps departed members' names rendering, and the first two are the whole of
  what is enumerable — "everyone the membership function admits" is not a listable
  set, since it admits every admin on the platform; an admin (or covering gedu outside
  the roster) becomes visible and mentionable the moment they send, via the
  unknown-sender refetch below. This RPC exists because `profiles` RLS deliberately
  lets nobody read another participant's row — the voice room resolves names from
  Daily's verified sender id, which persisted history cannot do, and the staff-overlay
  RPC is the shipped precedent for exactly this shape. **Deterministically ordered (by
  profile id)**: the chat CLAUDE.md makes roster order load-bearing — two accounts
  sharing a name resolve to whichever comes first, and the composer and in-place
  editor must receive the same array — so an order derived from live Daily
  participants would let the same typed `@Name` mean different people in different
  clients. (Id order is arbitrary but stable; the same-name collision it arbitrates is
  an accepted v1 tolerance already recorded in the chat CLAUDE.md.)
- **`send_chat_message(id, channel_id, body, reply_to_message_id)`** — guards:
  membership, not locked; validates `reply_to_message_id` is a **non-hidden** message
  of the same channel (`capabilities.ts` offers reply only on non-hidden targets), and
  **validates every mention token's id against the roster definition above** (refusing
  otherwise) — an unvalidated token renders attacker-chosen text as a trusted-looking
  chip in a room of children, and the honest composer only ever emits roster ids. The
  character cap is the column CHECK's (display-measured, above).
- **`send_chat_image_message(id, channel_id, width, height, reply_to_message_id)`** —
  the image row's creator, **called by the upload route** (row-first) with the
  dimensions the route's re-encode measured; same membership + lock + reply-target
  guards as the text send (the fan-out puts the reply on the first image when a burst
  has no text, so the reply parameter is load-bearing). Like every RPC it is
  directly callable by a member — the harm is a bounded-dimension image row whose
  object never arrives, rendering as the broken-image state and moderatable exactly
  like nuisance text; accepted, same as the session-photo route's posture.
- **`edit_chat_message(id, body)`** — own message, **not locked** (`capabilities.ts`
  is the spec: a lock takes away edits), not hidden, not an image message; same
  mention validation; sets `edited_at`.
- **`hide_chat_message(id)`** — own message (anyone, locked members included — taking
  back a regretted message is the one write a lock leaves), or any message
  (moderators, symmetric). Sets `hidden_at`/`hidden_by`. This is the delete control for
  images too: no storage action — the bucket policy reads `hidden_at` live, so hiding
  stops fresh image-URL minting for non-moderators by itself.
- **`restore_chat_message(id)`** — moderators only, on a hidden message.
- **`toggle_chat_reaction(message_id, code)`** — membership, not locked, code in the
  approved set, target message not hidden; insert-or-delete on the PK triple, stamping
  the denormalized `channel_id` from the message row (never from the caller).
- **`set_chat_lock(channel_id, user_id, locked)`** — moderators only; target must not
  be a moderator; insert-or-update the lock row (unlock updates `locked_at` to NULL).

**One named refusal**: "locked" raises a custom SQLSTATE (the session-photo P-code
pattern) held as a contracts constant, because the client treats it differently — a
send refused by a lock must not offer retry (the lock's own realtime arrival disables
the composer; the refusal races it). Every other refusal is generic and lands on the
components' existing failed-bubble + retry: the UI, driven by `capabilities.ts`, cannot
produce them, so named codes would buy branches nobody can see. `42501` stays the spine
guard's alone.

### Transport and client

- **`postgres_changes` on the three chat tables, as three `.on()` handlers of ONE
  channel** (a third of the joins, one status callback) — the shape the zone-data hook
  already uses for two tables. Broadcast-from-database is the documented fallback if a
  session room ever outgrows this; a room is ~a dozen people, so consistency with the
  codebase wins.
- **Subscription callbacks only invalidate queries or patch state from the payload —
  never a Supabase query inside the callback** (the standing deadlock rule; both
  allowed shapes are already documented in `src/components/voice/CLAUDE.md`). Chat
  patches messages/reactions/locks from payloads into the React Query cache and keeps
  the history query as the source on refetch.
- **Reconnect and loss handling, stated honestly**: no existing subscriber handles
  channel status at all, so this is new ground — the container subscribes with a status
  callback and **invalidates the history query on every `SUBSCRIBED` after the first**
  (the only reconnect signal Realtime offers). That reconciles a stranded pending echo
  and anything missed while down. A payload silently dropped on a socket that *stays*
  up arrives as nothing; the gap filler is React Query's default focus/refetch
  behaviour, which the container leaves on deliberately. Say both facts in the
  container's comments.
- **The optimistic echo is the feel-defining behavior**: the sender's message renders
  `pending` with a client-generated id the instant Send is pressed, reconciled to
  `sent` by id when the realtime INSERT payload (or the RPC return) lands; a failed
  send flips to `failed` with retry (and local drop — no row ever existed, so no
  tombstone and no confirmation). **Pending rows pin to the log's tail and
  reconciliation never moves a row upward**: ordering settled rows by server
  `created_at` but a pending row by the sender's own clock would let a skewed family
  tablet insert its message mid-log and jump it on reconcile — an already-painted log
  reordering on data's own schedule, which the layout rules forbid.
- **The typing indicator rides plain Realtime broadcast** on a channel keyed by the
  chat channel id — ephemeral, throttled client-side, never touches the DB. **Accepted
  and documented: broadcast is not RLS-gated** (Realtime authorization policies are
  machinery this repo has never used), so anyone authenticated who learns a channel id
  could join the typing channel; the payload is a first name and a boolean, and the
  membership function does not govern it. The repo's first broadcast use; keep it
  inside the chat container.
- **Service layer** follows the standard three-file pattern (`src/services/chat/`):
  service class over the injected client (reads = direct RLS-scoped selects + the
  roster RPC, writes = `.rpc()`), React Query hooks with a `chatKeys` factory,
  contracts file holding the zod row/RPC-result schemas and the locked-refusal
  SQLSTATE constant. **History read is a direct RLS-scoped select of the latest 200
  messages** (matching the old in-memory cap; upward pagination deferred) plus the
  channel's reactions and locks — no read RPC for rows the policies already scope; the
  roster is the one read that must be an RPC (it crosses `profiles` RLS). **The text
  feature needs no API route at all**; the first route arrives with images.

### Voice-room integration

- **The room layout's chat becomes a slot the page supplies, replacing the
  hardwired panel.** The live scheduled route passes the new container; instant rooms
  pass nothing; and the existing voice-room preview scenes pass a fixture-driven
  `ChatView` — the transport-free contract is exactly what makes that honest, the
  scene doctrine ("mock the whole page as the role meets it") is why the slot cannot
  simply be omitted there, and the chat scene at `/preview/chat/session` remains the
  design's one home (the voice scenes show the composition in place, which is their
  job). Deleting the old transport hook also removes chat from the voice provider
  contract, so the scenes' fixture contexts shed those fields in the same change.
- The **container component** (the transport half; the chat components stay
  transport-free) ensures the channel on mount, loads history + roster, subscribes,
  maps rows to the `ChatMessage`/`ChatAccount` shapes, and implements every
  `ChatViewHandlers` intention. The roster prop is fed from the roster RPC (not from
  Daily participants — see the ordering rule above), refetched **when a realtime
  INSERT arrives from a sender the current roster does not know** — the one signal
  that a staff drop-in or membership change has become visible in the log.
- **A channel the server refuses gets one quiet state, not a hole**: the ensure RPC
  refuses outside its window (and the voice token's 60-second grace can outlive it),
  and the ensure or the history load can simply fail — the slot renders a single
  muted "chat unavailable" line for all of these (one new key, five locales). A
  minimal state, added here deliberately rather than through a scene round: the
  signed-off design has no error surfaces because the scene has no server.
- The integration owes the surface two things (sign-off rulings): **a fixed height
  class for the panel slot** (the surface has one granted height and never grows), and
  **at least one text line of bottom padding beneath it** — the typing indicator
  overlays that padding by contract. Whether the container keeps the old panel's card
  chrome and which height class the room grants are implementer's judgment, judged in
  the room (the scene's geometry controls exist for exactly this).
- **Instant rooms lose chat entirely** in the same change: the chat slot renders only
  for group-linked rooms, and the old `ChatPanel`, its transport hook, its app-message
  type and its four message keys are deleted (prune the keys from all five locales). An
  instant room is voice-only; the no-table rule in
  `src/components/voice/instant/CLAUDE.md` stands untouched — the chat drop is what
  preserves it.
- Chat moderation copy says **"Gedus & Admins", never "staff"**, per-locale forms
  following the session-note strings' precedent.
- **Incident review after the fact is a psql session, and that is accepted by naming
  it**: the app reads only the latest 200 and never shows past sessions, so the staff
  review the retention decision protects runs through
  `docs/runbooks/remote-supabase-psql.md` — record that pointer in the chat CLAUDE.md
  amendment so nobody derives it the evening an incident is reported.

### Images

Any channel participant may send (decided: no moderator-only tier — every participant
in a scheduled room is an authenticated, parent-linked identity, the EXIF strip is
server-enforced, and persistence makes everything reviewable). The fan-out send, the
thumbnail-row grouping and per-thumbnail moderation are already the component contract.

- **A private `chat-images` bucket read through signed URLs.** One
  `storage.objects` SELECT policy joins the object name back to its `chat_messages`
  row and asks the membership function — so the family time bound covers image bytes,
  not just rows — **and admits a hidden message's object only to moderators**. The
  client renders via signed URLs it mints itself (minting requires SELECT under
  storage RLS, so the policy is the boundary), with an expiry chosen to outlive a
  session comfortably so URLs never churn mid-room; the container resolves `src`
  once per image (the components' contract) and marks every chat image `unoptimized`
  — signed URLs rotate per viewer, so optimizer caching buys nothing, and this also
  keeps `chat-images` out of `images.remotePatterns`. Consequences bought at once: no
  chat image is shareable outside the platform beyond a URL's bounded lifetime, and
  hiding an image retracts it (fresh mints refused) while staff review keeps the
  bytes. This is the repo's first storage-policy + signed-URL machinery; the
  session-images bucket keeps its unlisted-public posture and zero-policies rule —
  that model exists for cookie-less email GETs, which chat does not have.
- **The upload route** (the feature's only API route) follows the session-photo
  posture: JPEG magic-byte verification (chat is JPEG-only end to end, like the photo
  pipeline), row-first-object-second with compensating deletes, admin client for
  storage only while the guarded `send_chat_image_message` RPC on the caller's own
  client is the real authorization, object name = the message row id, `upsert: false`.
  Posture widens from the photo route's gedu/admin gate to "any authenticated member
  of this channel" — the RPC's membership + lock check is the boundary. Classified in
  the integration suite's route posture registry. The request byte cap, the bucket
  `file_size_limit` (neither existing bucket sets one; this one does) and the
  dimension CHECK bound all reuse the session-photo numbers — one set of image limits
  platform-wide.
- **The composer's staging gains the normalize pass** (a budgeted component change):
  today it decodes only for dimensions and keeps an object URL, no retained bytes —
  staging runs the existing normalize pipeline exactly as the session-photo composer
  does and keeps the encoded blob for upload, so the preview, the stored dimensions
  and the uploaded bytes are one artifact.
- **The route re-encodes through a shared `sharp` helper**: EXIF orientation baked,
  then a plain JPEG re-encode, which drops all metadata (EXIF/GPS) by default — the
  enforced half of the guarantee — and returns the true dimensions, which are what the
  RPC stores (client-claimed numbers never reach the columns; a fabricated
  `1 × 20000` would otherwise be a layout bomb in every viewer's log). `sharp` becomes
  an explicit dependency with the `serverExternalPackages` entry Next needs; the
  ~20 MB lands only on the two upload routes and is accepted. The **same helper is
  applied to the session-photo upload route in this branch** (owner request): the
  shipped RPC's signature does not change — the route simply passes its own measured
  dimensions where it used to pass the client's — and the existing client-side
  normalize pipeline stays as the honest path's pre-shrink on both. An integration
  test posts a GPS-bearing fixture JPEG and asserts the stored bytes carry no EXIF.
- **Signed-URL mechanics**: minted in one batched call per history load, expiry a
  flat generous constant (half a day — comfortably past any session with no
  mid-room churn); if a tab somehow outlives it, the next refetch re-mints, and that
  is the whole recovery story.
- **A row lands before its bytes** (row-first is what keeps the guard in front of the
  upload), so every subscriber except the sender briefly sees an image message whose
  object does not exist yet, and no second event corrects it. The image renderer gets
  a **bounded `onError` retry** (a few attempts over a couple of seconds) — a small,
  budgeted change to a signed-off component, compatible with the layout rules because
  the box is arithmetic from stored dimensions either way.

### CLAUDE.md amendments (owner signs off on the wording in this change)

- `src/components/voice/CLAUDE.md`: the "Chat, lock state, and live presence are all
  deliberately ephemeral" rule, the "Chat is sender-trusted only by identity, never
  persisted" rule and the two-tables-only persistence principle are rewritten
  deliberately — chat now persists in its own tables while Daily keeps owning rooms
  and presence; the in-call chat section points at `src/components/chat/CLAUDE.md`;
  the known-follow-ups list drops "persisted chat history" and "chat moderation".
- `src/components/voice/instant/CLAUDE.md`: one line — instant rooms carry no chat,
  and why (one chat system; a signed-out guest is deliberately nobody the DB can
  authorize).
- `src/components/chat/CLAUDE.md`: the "Not here yet" section is replaced with the
  landed transport facts — the accepted hidden-body wire exposure, the ungated typing
  broadcast, the signed-URL image contract and the psql review pointer — and the
  `unoptimized` note updated to the decision as made.

## Rejected alternatives

- **Chat SaaS (Stream, Sendbird, Twilio Conversations).** Per-MAU pricing on a product
  whose users are largely children; children's messages processed by a third party is a
  GDPR/DPA decision our safety copy would have to describe honestly; and we already own
  the two things they sell (a Postgres store, a realtime channel) plus the image
  pipeline.
- **Open-source chat UI kits.** The maintained field is thin and themed by its own
  CSS — cannot inherit our token system, one-dark-theme rule or `next-intl`. The
  surface is already built in-house and signed off.
- **An emoji-picker library.** Retired by the approved-set decision — a fixed reaction
  vocabulary is a row of buttons, and the right shape for a product full of children.
- **Staying on Daily app-messages.** No persistence, no delivery/ordering guarantees, a
  4 KB payload cap, present-participants-only, and no file transfer by design (chunking
  images over it was analyzed and rejected).
- **Anchoring channels to `group_sessions`.** The draft did; both reviews killed it.
  The ensure function is unguarded-by-design behind staff-only callers, so a
  participant-callable chat RPC reaching it would invert that guarantee and
  manufacture phantom session rows (blank feed cards, a child's id in `created_by`,
  orphaned report-owed badges) — and the table's one-session-per-day key is a
  documented architectural bet a per-window chat would strain. `(group_id,
  session_opens_at)` with server-derived instants gives chat the window key it
  actually needs and touches nothing.
- **Ephemerality, and delete-at-session-end (owner reversal, 2026-09-01).** The
  owner's first lean was deleting the whole log at session end; the honest constraint
  killed it for v1: no event fires when a session ends, so exact-time deletion needs
  machinery the app deliberately avoids. V1 keeps everything; the retention decision
  and the mechanism-candidates analysis (reap idiom, `pg_cron`, the Daily webhook's
  circuit-breaker delivery, the Storage-API-not-SQL deletion rule) live in the
  approved `TODO.md` item.
- **Dropping the read-rule time bound.** Considered for simplicity ("how would a gamer
  even read old chat?"); rejected because the RLS SELECT policy is directly queryable
  via PostgREST from any member's own account, and an unbounded policy exposes every
  past log — including sessions from before that member joined the group — forever.
- **Rate limiting (owner, 2026-09-01: none in v1).** The investigation had moved a
  per-sender sliding window into the send RPC and the sign-off had queued a designed
  composer refusal state; the owner cut both for simplicity — add later if real usage
  shows the need. The accepted consequence, recorded so it is a decision and not an
  oversight: a hostile-but-authenticated client can spam sends, reaction toggles
  (unbounded realtime churn), and image uploads (storage cost) up to whatever the
  moderator lock and account removal catch — the lock is the per-person control the
  owner did ask for, and it is immediate. If limits return, the repo's shipped shape
  is advisory-lock-then-count (a plain count is bypassed by parallel requests), and a
  window sized so a full image burst plus its text cannot refuse itself.
- **Wire redaction of hidden bodies.** A per-viewer blanked read path needs a view/RPC
  plus broadcast-shaped realtime; it protects only a late joiner with devtools.
  Accepted exposure instead (owner, 2026-09-01).
- **An unlisted-public `chat-images` bucket.** The draft's shape, chosen on precedent
  alone; rejected by the owner once the precedent's reason (cookie-less email GETs)
  was shown not to apply. Public URLs would have made every chat image — hidden ones
  included — permanently shareable outside the platform.
- **Client-side-only EXIF stripping.** Sufficient for the session-photo route's
  trusted staff uploaders, insufficient the moment any child's device uploads: a
  modified client (devtools suffices) posts an untouched GPS-bearing JPEG. The
  safety-copy rule allows only verified mechanisms to carry safeguarding weight, so
  the strip either moved server-side or stopped being citable; the owner chose
  server-side, for both routes.
- **A read RPC for messages.** The SELECT policies must exist for realtime anyway; a
  direct select is the same boundary with less machinery. (The roster RPC is not this
  — it exists because `profiles` RLS correctly refuses cross-participant reads.)
- **A shared repo-wide realtime subscription helper, extracted here.** Both reviews
  called it independently: an unrelated refactor riding along, generalising three
  subscribers whose shapes differ more than they rhyme — and migrating the
  private-zone occupancy hook (a privacy ledger with a documented history of expensive
  races) inside a chat branch is blast radius for nothing. Chat's container owns its
  own one-channel subscription; if a shared helper is ever wanted it is its own small
  change.
- **Broadcast-from-database as the primary transport.** Supabase's at-scale pattern,
  but a session room is ~a dozen people and `postgres_changes` is the codebase's
  established shape. Documented fallback only.
- **An attachment child table / captions.** The fan-out model (text XOR one image)
  removed both, and the components are built on it.
- **Moderator-only image sending.** Superseded by the owner: every participant sends;
  the authenticated-only room, the server-enforced strip and reviewability are what
  make it defensible.
- **Keeping chat in instant rooms.** Everything persisted here is authorized by
  knowing who someone is; a signed-out instant-room guest is deliberately nobody — no
  Supabase session, no profile, no credential any policy can read — and the
  4-character room code is guessable at scale and recycled by Daily, so code-keyed
  history would leak strangers' chat. If guest chat is ever wanted, the sketch: the
  creator (always signed in) materializes the channel; the token route hands joiners
  an unguessable channel id plus a short-lived signed guest credential; writes verify
  that credential; live reads use broadcast where the channel id is the capability.
  Roughly a week, nearly all of it guest credentials and a new anonymous-caller
  category in the authorization spine.
- **Slack-style thread panes; read receipts.** Replies are inline quote-replies in one
  flat log (owner interview); in a live room, "read" is being in the room.
- **Concrete per-surface tables instead of `chat_channels`.** Settled channels-now on
  the general-messaging ambition: one thin table and one enum, the seam a future DM or
  staff channel extends rather than forks.

## Steps

Build order within the one branch; each step verifiable on its own. DB tests run in CI
only — push the branch to exercise them. Each migration is pushed and types regenerated
(plus `src/types/index.ts` aliases for the new tables/enums) before its code commits.

1. **Schema migration**: the four tables, the enum, the CHECKs (XOR, display-length,
   dimension bounds, reaction codes), grants, RLS SELECT policies (locks own-row +
   moderator), the membership function composing the voice predicates with the grace
   literal, publication additions, `REPLICA IDENTITY FULL` on `chat_reactions` — plus
   the DB test asserting publication membership and replica identity.
2. **RPC migration(s)**: the nine RPCs (including the SQL window search inside
   `ensure_chat_channel`), the locked SQLSTATE, mention-id and reply-target
   validation. Spine classification + refusal db tests, including: a seat-holder read
   refused outside the window (the time bound) while a moderator's still succeeds,
   lock refusing a moderator target, hide symmetric across staff, a cap-length draft
   full of mentions accepted, a mention of a non-member refused, a reply to a hidden
   message refused, an edit refused under a lock, roster order deterministic — and
   the window-pinning test holding the SQL derivation to the TypeScript
   session-schedule fixtures. RPC-result zod schemas get db-test coverage parsing
   real output.
3. **Service layer** (`src/services/chat/`): service, queries, contracts.
4. **The voice-room integration**: the room layout's chat slot, the container
   (ensure-channel on mount, history + roster reads, the one-channel subscription
   with status handling, optimistic echo pinned to the tail, all intentions wired,
   typing broadcast, the chat-unavailable state), the height + bottom-padding
   contract honoured in the room layout, the voice preview scenes' fixture-driven
   chat slot. Old `ChatPanel`/hook/keys deleted; the voice provider contract sheds
   its chat fields; instant rooms render no chat.
   *Landed. Five judgment calls departed from the wording above, and are
   recorded here rather than rediscovered:*
   - **The typing payload carries an account id and nothing else, as a repeating
     ping with a short expiry** — not a name plus a boolean. The name a bubble
     draws comes from the roster, so an ungated broadcast cannot put a chosen
     name in front of a room of children; and an expiring ping needs no "stopped
     writing" message, so a client that closes mid-sentence heals itself.
   - **The viewer's own typing is detected by an `input`-capture listener on the
     container's wrapper**, because the chat components take no typing handler
     and giving them one would be the first crack in the transport-free
     contract. It covers the in-place editor for free.
   - **The locked refusal drops the echo instead of drawing a retry-less failed
     bubble.** The shared delivery note always offers retry on `failed`, and
     widening it is not a budgeted component change; nobody else ever saw the
     message, and the composer's own lock notice is what explains where it went.
   - **The send mutation writes the settled row into the history cache instead
     of invalidating it** (every other write invalidates). The RPC answers with
     the server `created_at`, the one field the echo could not know, so the
     alternative was a 200-row refetch to learn a row already in hand.
   - Image drafts from the composer are dropped in the container, with a comment,
     until step 5 gives them somewhere to go.

5. **Images**: the private bucket + storage policy migration, the composer staging's
   normalize pass, `sharp` as a dependency (+ `serverExternalPackages`) with the
   shared re-encode helper wired into the new chat upload route **and** the
   session-photo route, the posture-registry entry, batched signed-URL resolution in
   the container (`unoptimized` on), the renderer's bounded `onError` retry, the
   GPS-fixture integration test.
6. **CLAUDE.md amendments** (voice, instant, chat) — owner reads and signs off on the
   wording in this change.
7. **Staging shakedown**: a staging test group's real room
   (`docs/runbooks/staging-test-data.md`), two browsers + a phone — send/echo/
   late-join, a reconnect (kill the network, watch the invalidate reconcile), lock
   landing live mid-conversation, hide/restore on text and on one image of a burst,
   reactions, typing, an image burst end to end, a hidden image's URL refused for a
   non-moderator.
8. **Full-locale pass**: every new message key translated in all five locales (no
   emoji in `messages/`; `tlh` playful), widest-locale check on the composer strings.

## Acceptance criteria

- Two signed-in participants in a staging session room see each other's messages,
  edits, tombstones, reactions and locks arrive live without refetch; a late joiner
  sees the full log (latest 200) with every sender named, including one no longer
  present.
- The sender's own message is on screen as `pending` before the RPC resolves and
  reconciles without duplication or reordering; a killed network yields `failed` +
  retry; a dropped failed message leaves nothing; a reconnect reconciles anything
  missed.
- A locked gamer keeps reading, sees the visibly disabled composer, cannot send,
  react, reply or edit — but can still delete their own message; the lock survives a
  rejoin; a moderator cannot lock a fellow moderator, and can hide anyone's message
  including another moderator's; a lock's existence is not readable by other
  non-moderator participants.
- A hidden message shows the tombstone (no reactions rendered) to participants and the
  dimmed original to moderators; restore brings it back; a hidden image's signed-URL
  mint is refused for a non-moderator and still works for staff.
- A mention renders as a chip and emphasizes the row only for the person named; a
  crafted body naming a non-member is refused by the send RPC.
- An image send strips EXIF/GPS server-side (the fixture test proves it on both upload
  routes), stores server-measured dimensions, renders with no reflow, opens in the
  shared fullscreen viewer paging that send's burst, and can be individually hidden.
- A seat-holder's PostgREST select of a past session's channel returns no rows (db
  test); admin and assigned-gedu reads still work; no chat action ever creates a
  `group_sessions` row.
- Instant rooms show no chat anywhere; the old chat code and keys are gone.
- The preview scene still renders and drives the same components; no layout fork.
- Lint, type-check, unit + integration suites, and the CI spine/registry/db jobs all
  green; the smoke build passes.

## Constraints discovered while deciding

- **`group_sessions` is keyed by `(group, product-local date)` and its ensure function
  is unguarded behind staff-only callers** — the two facts that pushed chat channels
  onto their own `(group_id, session_opens_at)` key with server-derived instants.
- **Realtime `postgres_changes` respects RLS**, filters are one column per
  subscription, and DELETEs only replicate usefully when the old row carries what the
  subscriber needs — which is why unlock is an UPDATE, reactions denormalize
  `channel_id` and carry `REPLICA IDENTITY FULL`, and publication membership (visible
  nowhere in `schema.sql`) gets its own DB test.
- **The 500-character cap is a promise about the composed text** (mentions as
  `@Name`); the stored token form runs ~40 characters longer per mention. The
  display-measured CHECK is the one place the cap lives server-side.
- **`profiles` RLS refuses cross-participant reads**, and the old chat only worked
  around it by resolving names from Daily's verified sender id — persisted history
  needs the roster RPC.
- **No event fires at session end** — the fact that shaped the whole retention
  decision (now in the `TODO.md` item).
- **Supabase Realtime broadcast is not RLS-gated** without authorization machinery
  this repo has never used — the typing indicator's accepted property.
- **Signing a storage URL requires SELECT on the object under storage RLS**, which is
  what lets one bucket policy be the whole image read boundary — membership, time
  bound and hidden-state included.
- **`sharp` drops all metadata by default on re-encode** and reports true dimensions;
  it adds ~20 MB to the one route that imports it and tens-to-low-hundreds of ms per
  upload — the whole cost of making the strip a mechanism.
- **CSP already permits Supabase-host and `blob:` images** — no proxy change for the
  images step.
- **The scene is the design's one home** (`src/components/chat/CLAUDE.md`): chat
  components get no style-guide demo, and the container must not fork the layout.
- **A migration reaches the shared database on push while old code still runs** —
  every schema step here is purely additive, so the standard one-release shape holds
  with no compatibility staging.
- Two honest safeguarding gaps carry into any future safety copy rather than being
  papered over: nothing guarantees a moderator is present in the room while gamers
  chat (a gamer can be in a session room before the gedu joins), and v1 has no
  participant-facing report button — review is moderator-initiated. Neither claim may
  appear in family-facing copy as if it held.

## Follow-ups

Cut from this plan; they live and die with this file unless the owner names them
(the first is already in `TODO.md`, owner-approved):

- **Physical deletion of chat data** — the `TODO.md` "Chat retention" item.
- **Rate limiting** — if real usage shows abuse the lock cannot handle; the shipped
  shape to follow is recorded under Rejected alternatives.
- **Upward pagination** past the latest 200 (also what an in-app staff review surface
  would need).
- **Out-of-room mention notifications, DMs, a staff channel** — the general-messaging
  surfaces the schema's channel seam exists for.
- **Instant-room guest chat** — the guest-credential sketch under Rejected
  alternatives.
- **A participant-facing report button.**
- **The owner's final reaction set** — a constants edit plus per-locale labels, and
  once the wire-up lands also a migration altering the codes CHECK (there is no DB
  enum; the contracts zod schema derives from `CHAT_REACTION_CODES`, not from
  generated `Constants`). The provisional six stand until then.

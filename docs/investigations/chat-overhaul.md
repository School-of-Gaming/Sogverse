# Chat overhaul — persisted messaging, starting in the voice room

**Status: direction and behavior decided; the build starts scene-first via
`docs/plans/chat-preview-scene.md`, then wires straight into the voice rooms. Do not
build the wire-up from this file yet** — its remaining open decisions (see the final
section) are wire-up-time, and the wire-up plan will be written from this file once
the scene design is signed off. Researched August 2026 (images-only round early August;
widened 2026-08-31 after the owner set a new direction and answered the behavior
interview). Supersedes the earlier `voice-chat-images.md` investigation, whose durable
findings are folded in below.

## Direction set by the owner (2026-08-31)

These are decided, and they invalidate the previous investigation's framing:

- **Ephemerality is dropped.** Chat history persists for the duration of a session; late
  joiners and people who leave and return see the whole log.
- **Text moves off Daily app-messages.** With images in scope and persistence required,
  messages live in our own DB and Daily carries no chat at all.
- **This is a chat overhaul, not an images patch**: replies, mentions ("tagging"), and
  emoji reactions come along. The bar is "standard chat" — the WhatsApp/Slack/Discord
  vocabulary users already know — with nothing novel invented.
- **It should grow into a general messaging system.** Voice-room chat is the first
  surface; plausible later surfaces are parent ↔ admin direct messages, a gedu/admin
  staff channel, community features. Scope stays honest: build the first surface, but
  shaped so the second one extends rather than forks it.
- **Instant rooms drop chat entirely.** One chat system, not two: rather than solving
  anonymous-guest identity now (see below) or leaving instant rooms on the old
  transport, the existing app-message chat panel is removed from instant rooms in the
  same change. An instant room is voice-only. If a need surfaces later, it gets its own
  effort with the sketch below as its starting point.
- **Reactions use a hand-picked, approved emoji set** — a small fixed vocabulary, not a
  full emoji picker. This drops the one library purchase that was on the table, and a
  bounded set is the right shape for a product full of children anyway.
- **Every participant gets every chat feature — including sending images.** No
  moderator-only tier. This supersedes the earlier lean toward moderator-only image
  senders. What makes it defensible where the old investigation balked: this ships in
  scheduled rooms only, where every participant is an authenticated, parent-linked,
  group-assigned identity (the anonymous-guest worry died with the instant-room drop);
  the pipeline strips EXIF/GPS as a guarantee; and persistence makes everything
  reviewable after the fact — the opposite of the ephemeral design, where no copy
  survived to review.
- **Moderator controls come with it**: a gedu/admin can lock a gamer out of chat and
  delete any message or image. Gamer-sent images do not ship before the delete control
  exists (sequenced in the phasing below).
- **The build is scene-first, then wired straight into the voice rooms** (owner
  decision, 2026-08-31, superseding the admin-playground idea of earlier the same
  day). The playground was retired on the owner's own diagnosis: it tried to be a
  role-preview and a live backend test at once, and the backend's job — enforcing the
  restrictions — is exactly what the preview half had to bypass. Each purpose now
  lives where the repo already puts it: **design** iterates in a fully client-side
  interactive preview scene with mock accounts (`docs/plans/chat-preview-scene.md` —
  honest there because there is no backend to bypass); **transport truth** is shaken
  down in a staging test group's real voice room during the wire-up; **security** is
  proven by the CI authorization spine. A mock is ~95% honest about look and in-hand
  behavior and 0% about the wire, and the split follows that line. The retired
  playground plan went through its challenge + cold-read reviews first, and its
  backend design survives below.

**Behavior decisions from the owner interview (2026-08-31)** — these bind every later
phase:

- **Replies are inline quote-replies** (WhatsApp/Discord): one flat log, a reply
  carries a quoted snippet of its parent, tapping it scrolls to the original. No
  Slack-style thread panes.
- **Senders can edit and delete their own messages** — edits show an "edited" marker
  (no history view); self-delete leaves the same tombstone as a moderator hide.
- **The chat moderation control is "lock chat", patterned on the voice room's
  lock-mic/lock-video pair**: persistent until a moderator unlocks, the locked member
  keeps reading and sees a visibly disabled composer. Chat has no live track to force
  off, so only the lock half of the voice pair exists. As a channel-keyed DB row it
  survives rejoins within a session and expires with the session's channel.
- **Typing indicator: yes; read receipts: no.** The indicator rides realtime broadcast
  (net-new machinery; the scene simulates it, the wire-up proves it). In a live room,
  "read" is being in the room.
- **Mentions highlight for the target only** — a styled chip, and the mentioned
  person sees the message emphasized. No sound, no badge, no out-of-room
  notifications (those belong to the future general-messaging surfaces).
- **Reactions: one per emoji per person** (Slack/Discord toggle model), from the
  approved set; counts shown.
- **Images: the composer stages, the send fans out.** The composer accepts paste,
  drag-and-drop and a file picker into a staging queue; on send, each image becomes
  its own image-only message and the text (if any) its own message, back to back.
  A message is therefore text XOR one image — no captions, no attachment child table
  — and sender-grouping renders the burst as one visual unit (consecutive images can
  sit in a wrapping thumbnail row like the session gallery).

## What already exists to build on (verified in-repo, 2026-08-31)

**Today's chat** is one small feature: a panel (`src/components/voice/ChatPanel.tsx`)
plus a transport hook, shared verbatim by scheduled and instant rooms. Send is
`sendAppMessage` broadcast + local echo; the payload carries only `text` (500-char cap,
200-message log), and the display name is resolved at receive time from the
Daily-verified sender id — the anti-spoofing design. Discord-style sender grouping and a
fixed-height (`h-48`) auto-stick log already exist; there is no timestamp, reply,
reaction, or attachment anywhere in the shape. Four message keys total. Small enough to
replace outright rather than migrate.

**The session-photo pipeline (merged August 2026) is most of the images work already
done.** Reusable as-is or near-as-is:

- `src/lib/images/normalize-image.ts` + `image-dimensions.ts` — decode → EXIF-bake →
  downscale → flatten → JPEG re-encode in one pass, GPS/EXIF stripped as a guarantee
  (framed as safeguarding, not tidiness), stable error codes. Zero coupling to gedu.
- The gallery/viewer/geometry trio in `src/components/session-feed/` — thumbnails sized
  by arithmetic from stored dimensions (never by measuring a decoded image, which is what
  keeps first paint honest), and a fullscreen pager built on the shared Dialog. Coupled
  to session photos only through the URL helper; reuse behind a parameterized resolver.
- The upload-route pattern: magic-byte verification (never the declared content-type),
  row-first-object-second with compensating deletes, admin client used for storage only
  while a guarded RPC on the caller's own client is the real authorization, object name
  derived from the row PK. The route-registry entry documents the whole posture.
- The `session-images` bucket precedent: **public-but-unlisted** (random-UUID object
  names as the access control, no `storage.objects` policies so `.list()` stays
  impossible) — chosen because report *emails* must GET the same URL with no cookies.
  Chat images have no email consumer, so private + signed URLs is available — but nothing
  in the repo does signed URLs today, and unlisted-public has two shipped precedents.

**Realtime exists but thinly**: three ad-hoc `postgres_changes` subscribers (voice
zones, seat counts, the WhatsApp admin inbox), no broadcast, no presence, no shared
subscription helper — three hand-rolled copies of the same `useEffect`. The WhatsApp
inbox is the closest prior art: a live message thread driven by Realtime with React
Query as the store, invalidate-on-INSERT / patch-from-payload-on-UPDATE. A chat table
needs its own `ALTER PUBLICATION supabase_realtime ADD TABLE` line, and landing this is
the moment to extract the shared subscription hook.

**A DB anchor for a scheduled session already exists**: `group_sessions` is lazily
materialized per `(group, product-local date)` via an `ensure_group_session` RPC — the
session-photo feature materializes it exactly this way, and chat can too. One caveat:
it is keyed by *date* while the Daily room name is keyed by the session *window*, so a
group with two slots on one day would share one chat log unless the message rows also
carry the window-open timestamp (the `session_opens_at` idiom the private-zone occupant
table already uses).

## Why instant rooms can't just come along (the analysis behind the drop)

Everything this app persists is authorized by knowing who someone is — API routes, RLS
and realtime subscriptions all key on the Supabase session (`auth.uid()` → `profiles`).
A signed-out instant-room guest is deliberately nobody: **no Supabase session, no
`profiles` row, and no credential any route or policy can read**. Their identity is a
server-generated throwaway UUID inside the Daily token; the only route they touch is
the instant token route (`optional-auth`), and the repo has no guest bearer token and
no Daily-JWT verification helper. The room code is not a credential either: the
4-character space (~1.7M) is guessable at scale, and Daily recycles expired room names,
so code-keyed history would leak strangers' old chat into a new room with the same
code. Persisted attribution would also require snapshotting self-chosen guest names,
breaking the names-are-never-stored anti-spoofing property. And
`src/components/voice/instant/CLAUDE.md` forbids an instant-rooms table outright.

The unification path, if ever wanted (owner deferred it 2026-08-31 rather than pay for
it here): the room *creator* is always signed in and materializes the channel; the
token route hands every joiner an unguessable channel id plus a short-lived signed
guest credential; writes go through a route verifying that credential; live reads use
broadcast channels where knowing the channel id is the access control — the same
unlisted-capability posture the `session-images` bucket shipped with. Cost is roughly a
week, nearly all of it guest credentials and a new anonymous-caller category in the
route/authorization spine, not chat itself.

## Libraries — the answer to "do we have to write this from scratch?"

Three tiers were looked at; the useful ones are the small ones.

**Chat SaaS (Stream, Sendbird, Twilio Conversations): rejected.** They do provide
exactly the standard feature set (threads, reactions, mentions, attachments, moderation)
— that is their pitch — but the fit fails on our specifics: per-MAU pricing on a product
whose users are largely children; children's messages processed by a third party, which
is a data-protection decision (DPA, GDPR minors' data) our safety copy would then have
to describe honestly; their identity model presumes users we can mint tokens for, which
anonymous instant guests break; and we already own the two things they sell —
a Postgres message store and a realtime channel — plus a freshly built image pipeline.

**Open-source chat UI kits: rejected.** The maintained field is thin.
`@chatscope/chat-ui-kit-react` (the usual answer) last published over a year ago and is
themed by its own CSS file — it cannot inherit our token system, our one-dark-theme
rule, or `next-intl` strings, so every one of its surfaces would be fought rather than
used. The actively-developed chat-UI energy in 2025–26 went to AI-chat kits
(assistant-ui and friends), which are the wrong shape. Our design system wants to own
message bubbles anyway — the existing ChatPanel already has the hard parts (grouping,
auto-stick scroll) in-house and token-styled.

**Point libraries: none.** An emoji picker was the one candidate purchase
(`emoji-picker-react` / `emoji-mart`), and the approved-set decision retires it — a
fixed reaction vocabulary needs a row of buttons, not a picker. Supabase's own
documented chat patterns (broadcast vs `postgres_changes`, private-channel
authorization via RLS on `realtime.messages`) are the "logic library" — the
message/reaction/reply schema itself is a modest data model with no standalone library
ecosystem, because it is genuinely not the hard part. Self-hosted full servers
(Rocket.Chat, Matrix) are whole deployments with their own identity systems — wrong
scale entirely.

**Conclusion: build on Supabase + our own components; buy nothing.**

## The wire-up design (mostly settled — reviewed once already; the wire-up plan is
written from this section)

The retired playground plan carried this design through a challenge review and a
cold-read before the playground itself was dropped; what follows survives those
reviews with the playground-specific parts (personas, the admin channel type, the
seeded singleton, the `assert_admin()` guard stub) removed — guards are written
membership-scoped once, for the real surface.

**Schema, shaped for the second surface**: a `chat_channels` table (type enum with one
initial value, `group_session`, unique per session and materialized alongside
`ensure_group_session`), `chat_messages` (`channel_id`, `sender_id → profiles`, `body`,
nullable `reply_to_message_id` self-FK, nullable image columns — no child table,
settled by the fan-out model above — `created_at` ordering), and `chat_reactions`
(`message_id`, `sender_id`, reaction code, unique per triple) — the code drawn from the
approved set, CHECK-constrained in SQL and rendered to its glyph client-side, so the DB
never stores raw emoji and the set has one definition. Mentions ride *in* the body as a
structured token (stored markup, rendered as a styled chip), not a join table — v1
mentions are display + notification-sugar, not an inbox. Authorization follows the
repo's spine: writes through guarded SECURITY DEFINER RPCs; reads need genuine RLS
SELECT policies scoped to channel membership, because Realtime `postgres_changes`
respects RLS and the subscriber reads directly. A per-type membership function keeps
"who can see this channel" in one place, which is precisely the seam a future DM or
staff channel extends. Rate limiting moves into the send RPC (per-sender sliding
window) — the old investigation's "no moderation or rate limiting at all" gap closes as
a side effect of owning the transport.

**Refinements the reviews added** (kept so the wire-up plan inherits them, not
re-derives them):
- Messages carry `edited_at` (own-message edits) and `hidden_at`/`hidden_by` (soft
  delete, moderator or self); `chat_channel_locks` keys `(channel_id, user_id)` with
  a nullable `locked_at` — **unlock is an UPDATE, never a DELETE**, so both directions
  replicate without `REPLICA IDENTITY` changes. Both `chat_messages` and
  `chat_channel_locks` join the realtime publication: a lock landing mid-conversation
  must arrive live, not on refetch.
- **Non-authorization refusals raise named custom SQLSTATEs** (the session-photo
  P-code pattern) held as contract constants — rate-limit trip, locked member,
  not-your-message — and the client branches on code, never message; `42501` stays
  the spine guard's alone.
- **The sender's own message echoes optimistically**: client-generated id, pending
  bubble, reconciled by the realtime payload; a subscription reconnect triggers an
  invalidate so a missed payload can't strand a pending bubble; a failed send shows
  retry. This is the feel-defining behavior of the whole build.
- **History reads are bounded** (latest 200, matching the old in-memory cap; upward
  pagination deferred) and are a **direct RLS-scoped select**, not a read RPC — the
  SELECT policies exist precisely for realtime + reads. Text phase needs **no API
  routes at all**; the first route arrives with images (storage needs the admin
  client).
- **One consequence to decide at wire-up**: hidden messages' bodies travel to every
  subscriber and the moderator-only dimmed view is a client-side split. The exposure
  is narrow — everyone present received the body before it was hidden, so wire
  redaction only protects a late joiner reading deleted text from network traffic —
  and RLS cannot blank a column per viewer, so real redaction means a view/RPC read
  path plus a broadcast-shaped realtime change. Machinery vs. accepted narrow
  exposure: the wire-up plan decides with the owner.

**Transport**: `postgres_changes` on the chat tables, matching the three existing
subscribers, with the payload-application carve-out the voice hook already documents
(REPLICA IDENTITY FULL where deletes must replicate). Broadcast-from-database is
Supabase's recommended pattern at scale and stays the documented fallback, but a session
room is ~a dozen people; consistency with the codebase wins. The typing indicator (a
decided feature, above) is the one piece that rides plain realtime **broadcast** — it
is ephemeral by nature and must not touch the DB.

**Images**: any channel participant may send. The normalize pipeline and gallery/viewer
are reused, a new `chat-images` bucket sits on the unlisted-public precedent, and
intrinsic dimensions are stored so the log never reflows as bytes land. The upload
route's posture widens from the photo route's gedu/admin gate to "any authenticated
participant of this channel" — the guarded RPC's channel-membership check is the real
boundary, same shape as every other chat write. Per-sender rate limits in the send and
upload RPCs are load-bearing here, not hygiene.

**Moderation**: two controls, both moderator-only (admin or verified gedu — the same
pair who hold room moderation today). *Lock chat* is a channel-scoped row the send RPC
checks (see the interview decisions above for its semantics); the locked gamer keeps
reading. *Delete* is a **soft delete** — a hidden flag
that removes the message or image from every participant's view but retains the row
and bytes for staff review, because a moderator deleting something is exactly the
moment the record matters most; destroying the evidence of an incident with the same
click that handles it would be the wrong mechanism. (Physical deletion, if a retention
number ever lands, sweeps hidden content on the same schedule as everything else.)
Two honest gaps to carry into safety copy rather than paper over: nothing guarantees a
moderator is *present in the room* while gamers chat — a gamer can be in a session
room before the gedu joins — and v1 has no participant-facing report button; review is
moderator-initiated. Neither claim may appear in family-facing copy as if it held.

**Retention decomposes into two independent questions, and only one needs a trigger.**

*Who can see chat after the session ends* is a **read rule**, not a deletion: the
channel-membership function simply refuses reads once the session window has closed
(or closed + a grace period). That alone delivers the user-facing behaviour — history
during the session, gone after — with no job, no trigger, no mechanism at all, because
it is evaluated at read time.

*When bytes are physically deleted* is the only part needing a mechanism, and here the
honest constraint is: **no event fires at the moment a session ends.** Sessions end by
clock, and a clock firing is precisely the time-based job this app doesn't run. So
"deleted exactly at session end" is unachievable without new machinery; every
no-new-machinery option deletes at the *next convenient event after* the end:
- **Reap on join** — the established idiom (the voice token route already reaps stale
  occupancy rows on every join). Rows are a cheap SQL delete; image objects add
  Storage-API HTTP calls that must not block the join and must survive serverless
  suspend — the caveats the old investigation documented.
- **Purge on next materialization** — creating a group's next session channel deletes
  the previous one's chat. A weekly club purges weekly; a group that never meets again
  never purges, so it wants the reap as backstop anyway.
- The options that *would* give a real clock — `pg_cron` (installed, zero jobs, no
  runbook or alerting) or a Daily webhook — are the machinery the app has deliberately
  avoided. The webhook is real and was verified (2026-08-31): Daily fires
  `meeting.ended`, HMAC-SHA256-signed with a timestamp header. But its default delivery
  mode is a circuit breaker — **three failed deliveries and Daily stops sending all
  webhooks until manually reactivated** — and even the exponential mode caps at 5
  retries, with rough ordering and possible duplicates. So a webhook is a *latency
  improvement* on top of a reap, never a correctness mechanism on its own: a missed
  event must strand nothing, which means the reap backstop exists anyway. (If the
  endpoint is ever built, the same event could also tighten the private-zone occupancy
  reap — same caveat.)

Keep-forever needs nothing and makes chat staff-reviewable — a safeguarding
*improvement* over ephemerality (the old doc noted that no copy surviving made review
harder). The lean: ship the read rule (chat visible only during its session), keep rows
and objects, and treat physical deletion as a privacy decision with its own number,
taken separately — it can be added later without touching the user-facing behaviour.

**Scale arithmetic (2026-08-31 prices; per-unit so it survives club growth).** Supabase
Pro includes 100 GB file storage (then ~$0.021/GB·mo, no hard ceiling unless the
project's spend cap is on — *check that setting before trusting "no cliff"*) and 8 GB
database disk (then $0.125/GB·mo).
- **Text is a rounding error**: a message row is ~0.5 KB with indexes; a very chatty
  session (500 messages) is ~0.25 MB, so 100 chatty sessions/week ≈ 1.3 GB/year of DB
  disk — and text pruning, if ever wanted, is a plain SQL delete with no orphaned-file
  problem, addable any time.
- **Images set the real rate, and with all participants sending (the decided model)
  the chatty scenario is the baseline.** A normalized photo (2048-edge JPEG q0.8) runs
  ~200–600 KB. At ~30 images/session across a chatty group: ~15 MB/session ≈
  **80 GB/year per 100 sessions/week** — about a year to the included 100 GB (shared
  with session-report photos), then ~$2/month per further 100 GB. Egress stays inside
  the included 250 GB/month at these rates. A quieter reality (~3 images/session) is
  ~8 GB/year per 100 sessions/week.
- So deletion is never *forced* by capacity at any plausible scale; its eventual value
  is turning linear growth into a steady state (a 90-day window caps the chatty
  scenario at ~20 GB standing). Revisit with real send-rate data once v1 has run.

**UI**: designed **from scratch** for the full feature set (owner decision — the
existing `ChatPanel` is a reference, not a base): timestamps on group boundaries,
reply-preview strip above the composer, long-press/hover reaction affordance, lightbox
reuse. Message components are built presentational (rows + props, no transport in
them) so every surface — the preview scene first, voice rooms and future DMs/staff
channels after — renders the same components.

**Phasing** (scene-first, then wired straight into the voice rooms):
1. **The design, whole, in the preview scene** — every feature interactive against
   fixtures, mock accounts, simulated latency and activity. Planned in
   `docs/plans/chat-preview-scene.md`. The scene designs all phases at once; the
   wire-up lands them incrementally.
2. **Wire-up: the text core into the voice rooms** — schema, membership-scoped RPCs,
   realtime, late-joiner history, text moderation (lock chat + soft delete),
   edit/delete-own, removal of chat from instant rooms, the `voice/CLAUDE.md`
   amendments, and the realtime shakedown in a staging test group's room. Its plan is
   written from this file once the scene design is signed off.
3. **Wire-up: reactions, replies, mentions, typing indicator.**
4. **Wire-up: images** — the pipeline reuse described above, shipping *with* the
   image-delete control in the same phase (gamer-sent images never exist without it).

Text moderation belongs in the first wire-up: it is part of owning the transport, and
retrofitting it after people are already chatting is the wrong order.

Rough effort: the scene is days; the text wire-up is the big one (schema + realtime +
staging shakedown, ~1.5 weeks with the UI already settled); the rest are a few days
each, images cheapest because the photo work paid for it.

## Written rules this contradicts — amendments needed in the same change

- `src/components/voice/CLAUDE.md`: "Chat, lock state, and live presence are all
  deliberately ephemeral"; "Chat is sender-trusted only by identity, never persisted";
  the two-tables-only persistence principle. Its own follow-ups list already names
  "persisted chat history" as a known tension, so this is a foreseen revisit — but the
  rules must be rewritten deliberately, not left contradicted.
- `src/components/voice/instant/CLAUDE.md`: its no-table rule stands untouched — the
  chat drop is what preserves it. Its prose gains one line saying instant rooms carry
  no chat and why; the chat section rewrite in `voice/CLAUDE.md` (which today says chat
  is "shared by scheduled and instant rooms") carries the rest.
- Root CLAUDE.md's realtime rule ("only invalidate queries") already carries the
  update-from-payload carve-out in `voice/CLAUDE.md`; the extracted subscription helper
  should state both allowed shapes.

## Decisions still open — all wire-up-time (the scene plan needs none of them)

1. **Physical deletion: keep rows/objects after the session, or delete-after-N?** The
   read rule already hides post-session chat either way (see Retention above); this is
   the privacy call on the bytes. Keep-forever needs no mechanism and is
   staff-reviewable; any delete-after-N needs a number plus one of the after-the-fact
   mechanisms above. (Lean: keep for now, decide the number with real data.)
2. **The approved reaction set itself** — which emoji; the owner picks it in the
   preview scene, where changing it is a constants edit.
3. **Hidden-body wire redaction** — see the wire-up refinements above: machinery vs.
   the accepted narrow late-joiner exposure.
4. **Sign-off on the CLAUDE.md principle amendments** above, in the wire-up change.

(The schema-generality question — channels table now vs concrete tables — is settled
as channels-now on the general-messaging ambition: one thin table and one enum, not a
framework, and the seam every later surface extends.)

## Sources

- Daily — `sendAppMessage` (4 KB cap, present-participants-only, no delivery/ordering
  guarantees): https://docs.daily.co/reference/daily-js/instance-methods/send-app-message
- Daily — Prebuilt chat is text-only; file exchange pointed at third-party chat:
  https://help.daily.co/en/articles/2260198-chat-and-participant-list-in-daily-prebuilt
- Supabase Realtime — subscribing to database changes:
  https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Realtime — authorization (RLS on `realtime.messages`, private channels):
  https://supabase.com/docs/guides/realtime/authorization
- Supabase Realtime — broadcast (incl. broadcast-from-database):
  https://supabase.com/docs/guides/realtime/broadcast
- chatscope chat-ui-kit-react (staleness, own-CSS theming):
  https://github.com/chatscope/chat-ui-kit-react
- Sendbird chat pricing (per-MAU model): https://sendbird.com/pricing/chat

## Superseded findings kept for the record

From the images-only round (early August 2026), still true and still load-bearing:
Daily has no file transfer by design and chunking over app-message was rejected
(no delivery/ordering guarantees, sender is the sole byte source); deleting
`storage.objects` rows in SQL orphans the files, so any deletion goes through the
Storage API; `pg_cron` is installed with zero scheduled jobs and pg_cron jobs live in
`cron.job` rows that `schema.sql` never captures (same for `storage.objects` policies);
CSP already permits Supabase-host and `blob:` images. The parts that died with
ephemerality: signed-URL-lifetime arithmetic, the reap-on-join cleanup design, and the
Daily-webhook cleanup idea — all were costs of images outliving their transport, and a
persisted DB log has no such gap to bridge.

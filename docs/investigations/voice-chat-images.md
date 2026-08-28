# Images in voice-room chat

**Status: investigation, nothing decided — do not build from this file.** Several
product decisions are open (see **Open questions**); this exists so the constraints and
rejected alternatives are not re-derived. Researched August 2026. If committed to, it
becomes a `docs/plans/` plan and this file is deleted. (It previously sat in
`docs/plans/` under an apologetic banner because no investigations home existed yet.)

## What was asked

Whether the in-call chat in voice rooms could carry images, and what it would cost.

Chat today is text over Daily's app-message channel, held in React state for the session
and never persisted. The requirement attached to the question: **images stay ephemeral —
only participants present at the time should see them.**

## Scale

Unknown and not yet investigated. The motivating case discussed was a game educator
sharing a screenshot or reference image mid-session. Nobody has asked for gamer-to-gamer
image sending, and see **Open questions** for why that is a different feature.

## Constraints discovered (the durable part)

These were verified during the investigation and are the reason the design looks the way
it does.

**Daily app-message**
- Payload cap is 4 KB. Too small for any real image; a transfer would have to be chunked.
- Delivered only to participants currently in the call, and explicitly not stored or
  replayed for late joiners. This is exactly the ephemerality requirement, provided by
  the vendor rather than enforced by us.
- Daily documents **no delivery or ordering guarantees**. Searched for and not found —
  treat as absent, not undocumented.

**Daily meeting session data**
- `setMeetingSessionData` holds a max **100 KB total** shared state, synced at most once
  per second, and is not persisted after the session ends. Genuinely ephemeral, but it is
  a small shared-state store, not a message log — it would hold roughly one image and
  would need hand-rolled garbage collection.

**Daily has no file transfer, by design**
- Daily Prebuilt's own chat is **text only**.
- Daily's own guidance on adding chat says that for file exchange, "a third-party chat
  integration would be the best way to do that."
- No prior art was found for chunking images over app-message. The absence looks
  deliberate rather than accidental.

**Supabase Storage**
- **Deleting rows from `storage.objects` in SQL does not delete the file.** It drops the
  metadata row and orphans the object in the backing store, so storage usage keeps
  growing. Deletion must go through the Storage API. This rules out a SQL-only cleanup
  job.
- A signed URL bypasses RLS, so a viewer needs no storage permission at all — relevant
  because instant-room guests have no Supabase identity.

**This project's scheduling**
- The `pg_cron` extension is installed but **there are currently zero scheduled jobs** —
  every job that ever existed has since been unscheduled. A cleanup cron would be the
  project's only scheduled job, with no existing runbook or alerting around it.
- To re-verify: grep the whole migration history for `cron.schedule` / `cron.unschedule`
  and trust the highest-numbered occurrence. pg_cron jobs are rows in `cron.job`, not
  DDL, so `schema.sql` does not capture them — this is one of the documented exceptions
  in `supabase/CLAUDE.md`. The same is true of `storage.objects` policies, so any bucket
  added for this feature will likewise never appear in `schema.sql`.

**Existing app constraints**
- CSP already permits images from the Supabase host and `blob:`, so no CSP change is
  needed for either approach.
- The chat log is a fixed-height scroll area. Under the layout rules an image must not
  reflow the log as it decodes, so its intrinsic dimensions have to be known before the
  bytes arrive. The current log height is also too short to display images meaningfully.
- Moderators in **both** room types (scheduled group rooms and instant rooms) are
  authenticated admins or verified gedus. Only non-mod instant-room joiners are
  identity-less. So a moderator-only feature keeps every uploader inside ordinary
  RLS-gated auth and needs no upload API route.

## Leading shape (not agreed)

Bytes to a **private** Supabase Storage bucket; a short-lived **signed URL** carried in
the app-message. Transfer gets HTTP's retries and resumability; the ephemerality comes
from app-message delivery semantics, since a late joiner never receives the message and
so never learns the URL exists. Signed-URL lifetime must cover the longest possible
session, which is set by the instant-room expiry, not the group session window.

Cleanup by **self-healing reap on join** rather than a scheduled job — the voice token
route already reaps stale private-zone occupancy rows on every join, and
`voice/CLAUDE.md` states the no-cron principle explicitly. The reap must not block the
join (it is an HTTP round trip to Storage, unlike the cheap DB delete it would sit
beside) and must survive the serverless function suspending after the response.
Date-partitioned object paths keep the listing small.

Rough effort for a moderator-only version, if the open questions resolve this way:
**~4–5 days**, covering the bucket migration, client-side compression/EXIF-stripping, the
chat message-type changes, the panel redesign plus a lightbox, the reap, translations
across every locale, and tests.

## Rejected alternatives, with reasons

- **Chunked transfer over app-message.** Investigated seriously and rejected. With no
  delivery or ordering guarantees, a single dropped chunk loses the whole image; worse,
  the sender is the sole source of the bytes, so a sender-side network blip strands every
  receiver holding a partial buffer with nobody to re-request from. Recovering means
  hand-rolling retransmission over a channel not built for it. The vendor's own product
  does not do this and their guidance points elsewhere.
- **`setMeetingSessionData` as an ephemeral blob store.** 100 KB total and a one-second
  sync ceiling. Holds about one image; it is a state store, not a log.
- **Custom video track / screen share for images.** Poor fidelity for screenshots and it
  is not a chat log. Note that screen share already exists for "show everyone this right
  now", at zero cost — worth confirming that does not already cover the real need.
- **Public storage bucket.** A private bucket plus signed URLs costs little more and
  avoids a durable URL that can be passed outside the call.
- **`pg_cron` job deleting rows from `storage.objects`.** Orphans the files. See above.
- **Image bytes in Postgres.** Object storage is the right home.

## Open questions — these are what keep it from being a plan

1. **Who can send?** Moderator-only is the assumption behind the effort estimate above
   and keeps every uploader authenticated. Letting gamers send is a materially different
   feature: gamers are children, instant rooms admit anonymous guests, and chat currently
   has no moderation or rate limiting at all. Ephemeral delivery does not reduce the harm
   of a child receiving unsolicited imagery — it arguably makes review and reporting
   harder, since no copy survives. That version needs a moderation pipeline, a reporting
   path and a retention policy, and should be decided on its own merits.
2. **Retention number.** How long may an image outlive its call? Join-triggered reaping
   means an image survives until someone next joins. If a guaranteed clock is required
   regardless of further joins, that forces the scheduled job back in.
3. **Does `voice/CLAUDE.md` get amended?** It currently states that voice persists
   nothing beyond zone definitions and the private-zone boundary, with cleanup delegated
   to Daily's room expiry. A storage bucket is the first durable voice artifact and
   contradicts that. The amendment should be deliberate, or the principle should win and
   the feature should not ship.
4. **Panel redesign.** The chat log is too short for images. Needs a design pass, not a
   patch — including a lightbox and how images sit alongside text in the grouped-sender
   layout.
5. **Unverified: client-side app-message rate limits.** A documented 20/sec figure was
   found but it applies to the *REST* endpoint; no client-SDK limit was located. Only
   matters if chunking is ever revisited.
6. **Unexplored: Daily webhooks as a cleanup trigger.** Could delete a room's images at
   actual call end rather than on a timer or a later join. Would add a webhook endpoint
   and signature verification, and would still want a backstop.

## Sources

- Daily — `sendAppMessage`: https://docs.daily.co/reference/daily-js/instance-methods/send-app-message
- Daily — `setMeetingSessionData`: https://docs.daily.co/reference/daily-js/instance-methods/set-meeting-session-data
- Daily — three ways to add chat: https://www.daily.co/blog/three-ways-to-add-chat-to-your-video-calls-with-the-daily-api/
- Daily — Prebuilt chat is text only: https://help.daily.co/en/articles/2260198-chat-and-participant-list-in-daily-prebuilt
- Supabase — deleting objects: https://supabase.com/docs/guides/storage/management/delete-objects

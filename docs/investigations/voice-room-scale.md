# Voice room scale: 100 and 300 people in one room

Whether one voice room — scheduled or instant — can hold 100 or 300 people at once, what
stands in the way today, and what it would take while staying on Daily.co.

**Status: open, nothing decided.** Researched 2026-10-15 by reading the code on `dev` and
Daily's published scaling docs. **Nothing here is measured**: every capacity figure for our
own client is an estimate from how the code works, and Daily's limits are what its docs
said on that date. Re-verify both before quoting a number into a plan.

## Where it stands

**Every room is created with a hard cap of 50 participants.** The voice constants set the
cap and the Daily room-creation helper applies it to scheduled and instant rooms alike;
Daily refuses the 51st join. So today the answer to both 100 and 300 is no, before any
performance question arises.

**A room keeps the cap it was created with.** Raising the constant reaches only rooms
created afterwards — a scheduled room already created for the current window, or an
instant room still inside its 8-hour life, stays at 50.

## Daily's side (docs, 2026-10-15)

- A "large call" is up to **1,000 active participants** on the SFU, with a custom client
  expected to show each person **at most about 12 others** at a time.
- Above **50** participants a room needs `experimental_optimize_large_calls: true`; above
  **200** Daily recommends `enable_terse_logging`. Our room creation sets neither.
- By default every participant is subscribed to every other participant's tracks;
  `subscribeToTracksAutomatically: false` hands subscription to the app (SFU calls only).
- Beyond 1,000, or for a stage format, **interactive live streaming** allows up to 25
  people with devices on and up to 100,000 watching.
- Older Daily posts quote a 300-person ceiling, since raised to 1,000 — the current docs
  are the reference.

Daily is therefore not the constraint at 300. Our client's design is.

## Why the client is the constraint

Every client receives and processes every other participant, whatever zone they are in:

- **Every track is received.** Soft zones (lobby, the Yty elements, custom zones) isolate
  audio by muting the `<audio>` element client-side, not by withholding the track — the
  voice `CLAUDE.md` describes this as deliberate, because the speaking glow and cross-zone
  video come from the still-received tracks. Only locked zones withhold media, through the
  SFU's `canReceive`.
- **Video is received at whatever quality Daily defaults to.** Cameras start off (the token
  sets `start_video_off`), but every camera that is turned on is downloaded and decoded by
  every peer; nothing sets receive settings or caps the number of video subscriptions.
- **Two per-frame loops per unmuted participant.** The speaking glow runs one
  `requestAnimationFrame` loop on the participant's zone tile and another on their
  participant-list row, each reading an analyser and writing a box shadow every frame. At
  50 people that is about 100 loops per frame.
- **The whole participant list is rebuilt on every Daily event.** The provider re-reads
  every participant on each participant-updated, track and active-speaker event and
  replaces the list, re-rendering the zone board and the participant list. The work grows
  with room size times event rate, and event rate itself grows with room size.
- **The UI draws everyone.** The zone board renders a draggable tile for every participant
  and the participant list a row for each; neither is capped or virtualized.

### Estimated comfortable size today (unmeasured)

| Condition | Estimate |
|---|---|
| Audio only, cameras off (the default), laptop | the 50 cap is likely fine |
| Audio only, older phone or school Chromebook | strain from about 30–40, from the glow loops and re-renders rather than audio decode |
| Cameras on | the camera count matters more than the head count: phones around 10–20 cameras, laptops around 20–30 |
| A typical club group (a dozen children plus a gedu) | plenty of headroom |

## What 300 would take

The lean is **realistic on Daily, as a dedicated project of a few weeks**, provided the
room's *use* is designed for that size (see the next section). The work, roughly in
order of weight:

1. **Room configuration (small).** Raise the cap per room type, set
   `experimental_optimize_large_calls` and `enable_terse_logging`.
2. **Manual track subscriptions (the core).** Stop auto-subscribing. Each client
   subscribes to its own zone's audio, any broadcasting moderator, and video for at most
   about 12 visible tiles. Consequences:
   - Soft zones become a real audio boundary rather than a client-side mute — a privacy
     gain the current design does not offer.
   - Cross-zone video and speaking glow disappear; another zone's people become names and
     avatars. This is a deliberate reversal of a current voice rule and needs the owner's
     ruling.
   - Locked zones keep `canReceive` unchanged; subscription is a cost control, never the
     privacy boundary.
3. **UI for 300 (a redesign).** Zones show a count and a capped set of avatars; the
   participant list is virtualized; the speaking glow comes from Daily's active-speaker
   event instead of a per-row analyser loop; moderator moves probably shift from
   drag-and-drop over everyone to search-and-move.
4. **Incremental participant state.** Apply each Daily event to the one participant it
   concerns instead of rebuilding the whole list.
5. **The join burst.** Each join makes two Daily REST calls (the room probe and the
   meeting-token mint). 300 children arriving in the same minute risks Daily's REST rate
   limits; Daily supports self-signed meeting tokens, which would remove the token call.
   The limits themselves were not checked.
6. **Load outside voice.**
   - In-call chat: 300 subscribers on one Supabase Realtime channel, with the typing
     broadcast fanned out to all of them, and the plan's concurrent-connection limit.
   - Private zones: each placement has a moderator's client push a permission update
     covering the whole room. Probably fine at 300, untested.
7. **Cost.** Daily bills per participant-minute, so a 300-person hour costs about thirty
   times a ten-person one. Pricing was not checked.

**100 is a subset of this**: items 1 and 4, plus either cameras kept off or subscription
limited to the current zone, would likely do; the zone model mostly survives.

## The product question that matters more

**300 open microphones are unusable however good the code is.** A 300-person room needs a
speaking model: everyone starts muted, the floor belongs to moderators (or raise-hand /
push-to-talk), and conversation happens in breakout zones. That model is also what keeps
item 2 cheap, since a muted mic sends nothing. Moderator coverage — how many gedus a room
of 300 children needs — is a safeguarding question this research did not touch.

**If the format is "a few speakers on stage, everyone listening, then breakouts",** Daily's
interactive live streaming, or one stage room plus ordinary-sized breakout rooms, may reach
it for far less work than one 300-person interactive room.

## Next steps that would settle it

1. **A bot load-test harness**: Playwright browsers with fake mic and camera streams
   (Chrome's fake-media-device flags) joining a staging room, ramped through 10, 25 and
   50, while CPU, frame rate and audio quality are watched on one real phone and one real
   laptop in the same room. This gives today's measured ceiling and says whether the glow
   loops or the list rebuilds bite first.
2. **Prototype item 2 alone** and run it at 300 bots (with the cap raised on that test
   room). If it holds, the rest is ordinary UI and app work; if it does not, that is
   learned cheaply.

What would change the lean: Daily's large-call mode behaving differently from its docs at
300 (event delivery, permission-update limits), the join burst hitting a hard REST limit
that self-signed tokens cannot avoid, or the product answer being a stage format, which
points at live streaming instead.

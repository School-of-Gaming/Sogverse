# Instant Voice Rooms

On-the-fly voice rooms any admin or *verified* gedu can spin up, share via a short URL, and let anyone (signed-in or not) join. Distinct from the schedule-driven group voice rooms — those are documented in `../CLAUDE.md`.

## Flow

A moderator (admin or verified gedu) creates a room from the Tools surface their role has — `/admin/tools` for an admin, the `/gedu` dashboard's Tools section for a gedu. The server allocates a 4-character code, asks Daily.co to create a room named with that code, and returns the code. The dashboard shows a copyable URL chip + a Join button. The mod shares `/voice/{CODE}` with whoever should join. Anyone with the link joins, no account required — signed in they join as themselves, signed out they type a name. The room dies when a mod clicks "End for everyone" or after the room's `exp` (8h), whichever comes first.

The page runs under the **standard app header with no footer** — that is the whole reason the `(voice)` route group exists (see `../../layout/CLAUDE.md`). It used to carry a simplified header of its own, from a launch era when the surrounding site wasn't production-ready; scheduled group rooms already ran live calls under the standard chrome, so the special case was inconsistency rather than protection.

## No database

**There is no `instant_voice_rooms` table.** The 4-character code IS the Daily.co room name, and Daily is the only source of truth for a room's existence and lifetime. "Never existed", "ended", and "expired" all collapse to the same Daily 404, and the UX treats them identically (one not-found screen, code echoed back for typo-spotting). Consequences:

- Room creation gets the URL back immediately — there's nothing to list, so no list endpoint.
- Daily's `exp` handles cleanup; no cron.
- Empty rooms cost nothing (Daily bills per participant-minute), so an abandoned room just idles until `exp`.

**Rule: Do not add a DB table to track instant rooms.** If you need room state, read it from Daily. Adding a table reintroduces a sync problem the design deliberately avoids.

**Rule: an instant room carries no chat** — it passes nothing to the room layout's chat slot, and no chat card is drawn. There is one chat system, it is persisted, and everything in it is authorized by knowing who someone is (`../../chat/CLAUDE.md`); a signed-out guest is deliberately nobody the database can authorize — no session, no profile, no credential a policy could read — and a 4-character code Daily recycles is not an identity to key history on either. So an instant room is voice only, and the no-table rule above needs no exception carved for chat.

## Code format & collisions

Codes are 4 characters from a 32-symbol alphabet — `A-Z` minus `I`/`O`, `2-9` (no `0`/`1`) — the glyphs humans confuse least when reading aloud or typing. ~1M unique codes. Generation, validation, and normalization live in `src/lib/voice-room-code.ts`.

**Rule: Every code crossing a trust boundary (URL param, request body) must be validated/normalized through the `voice-room-code` helpers before any Daily API call.** Validate-then-uppercase via `normalizeVoiceRoomCode` (returns `null` on anything malformed); never hand-roll the regex. This is the SSRF/path-injection guard — a raw code interpolated into a Daily REST path is the vector. Disallowed glyphs are rejected, not remapped (mapping `0→O` would hide typos).

We don't pre-check codes for collisions. Create attempts a Daily room with the random name; on Daily's duplicate-name error it retries with a fresh code (capped by `VOICE_CONFIG.INSTANT_ROOM_CREATE_MAX_RETRIES`). No DB lookup, no race window. Do not switch this to a get-or-create helper: a random code isn't authorization-gated, so silently joining an existing room on collision would leak someone else's room.

## Permissions

Auth is detected server-side at the token endpoint and **never** trusted from the client.

**Permission and identity are separate axes.** Being signed in decides *who you are* in the
room; being a moderator decides *what you can do*. Conflating them is the mistake the table
below encodes against — a parent joins as themselves and can still do nothing but move
between zones.

| Visitor | `is_owner` | Identity | Permissions |
|---|---|---|---|
| Signed-in admin / **verified** gedu | true | `profile.id`, `profile.first_name` | Full mod (mute, lock, screen-share, end) |
| Signed-in **unverified** gedu | false | `profile.id`, `profile.first_name` | Guest — verification is the mod boundary |
| Signed-in parent / gamer | false | `profile.id`, `profile.first_name` | Guest |
| Signed-out | false | server UUID + lobby name | Guest |

**Rule: the token's role slot is `"guest"` for every non-owner** — it is the *permission*
label, not identity, and every client gate is a positive `role === "admin" || role ===
"gedu"` check, so guest behavior falls out for free. Putting a real role there for a
signed-in non-mod would light up the cosmetic mod UI ("End for everyone") that the server
then 403s. Identity is where "join as yourself" lives: `userId` + `displayName`.

**Rule: An uncertified gedu is not a moderator here.** A gedu self-registers with broad
platform access but stays uncertified until an admin approves them (see
`../../../services/gedu/CLAUDE.md`), and moderating an instant room is gedu-initiated — so
the gate is **server-side**, on all three mod surfaces: `create` and `end` 403 (via
`requireCertifiedGedu` on `requireRole`), and the public `token` route gives an uncertified
gedu guest permissions (no `is_owner`), failing closed to guest on any certification-lookup
error. What that error costs them is ownership, never their name — they are signed in, so
they still join as themselves. The check is `isGeduCertified`
(`../../../services/gedu/gedu-profiles.service.ts`).

One UX surface mirrors the boundary (UX only — the server gates above are the real
boundary): the `/gedu` dashboard's Tools section hides the create card. The notice in its
place is the *section's*, not this feature's — certification gates every tool under that
heading at once, so one card explains it for all of them rather than one per panel. The join lobby no longer mirrors anything, because it no longer asks the question:
its only conditional element is the name input, and that turns on *sign-in*, not on
moderation.

**One predicate, one consumer.** The owner-eligibility decision (admin or certified gedu →
moderator identity, else guest) lives in a single `instantRoomModerator`
(`../../../lib/voice/instant-room-moderator.ts`), and the token route is the only thing
that reads it. The `/voice/[code]` page used to read it as well, so the lobby could show
the guest name input to exactly the viewers the server would treat as guests; sharing the
predicate was what stopped an unverified gedu from being shown a mod lobby (no name field)
and then 400-bounced by the guest-name requirement. **That hazard is gone structurally, not
by vigilance**: a signed-in unverified gedu needs no name at all now, so there is no
mismatch left to have. What the page reads instead is the session itself
(`getUserWithProfile`) — the same session the token route reads — so lobby and token still
agree about identity by construction. One residual edge sits on the *freshness* axis
rather than the predicate axis: the page's session read is a render-time snapshot, so a
session that dies between render and join (sign-out in another tab, an account switch)
still 400-bounces — name required, no input shown. A reload recovers, and that is the
accepted answer for how rare it is; the join handler carries a comment marking it.

**A signed-in gamer therefore shows their real first name** to everyone in the room rather than a chosen alias. Deliberate and accepted: scheduled group rooms already broadcast profile first names, and an instant room link is shared intentionally by a moderator.

A voice "guest" is permission-equivalent to a gamer: no mute/lock/screen-share/broadcast/deafen, can only move themselves between zones. The voice role union is `UserRole | "guest"` — `"guest"` is display-only; all gating uses positive `role === "admin" || role === "gedu"` mod checks, so guest behavior falls out for free. Instant rooms have no group, so they get the lobby + 4 Yty zones only — no custom or locked zones (`VoiceRoomProvider` is passed `groupId={null}`).

**Rule: Both token ownership and a signed-in joiner's identity are computed only from the server session (`getUserWithProfile`), never from the request body.** Body fields named `isOwner`/`role`/`userId` are ignored by design, and `displayName` isn't even read once a session resolves to a profile (all pinned by integration tests). On any auth-detection failure — no session, profile lookup error, role not admin/gedu — fall through to a guest token. There must be no path where ambiguous auth grants ownership, and a session we can't resolve to a profile takes the **signed-out** path whole rather than half-guessing an identity from it.

## Security model

The room is open by design; defenses target privilege escalation and bounding blast radius, not gatekeeping entry.

- **Daily-signed `is_owner` is the real authority.** Tokens are signed with `DAILY_API_KEY` server-side; nothing client-supplied confers mod power. Display-name role badges (if any) are cosmetic.
- **Display-name pipe injection.** Daily `user_name` is encoded `userId|role|displayName`. `buildUserName` strips `|` from the display name so a guest can't inject a fake role slot. Cosmetic-only fix (the signed token wins) but keep it.
- **A signed-in non-moderator's stable `profiles.id` is broadcast to the room.** It rides
  the token's `userId` slot, which Daily hands to every participant — including signed-out
  strangers, since the room is open to anyone with the link. **Accepted risk**, decided
  alongside the first-name note above: group-scoped rooms are the locked-down surface;
  instant rooms are public by nature and trade some privacy for that. A profile id is not
  a secret (everything it could key is RLS-gated), and the real id is what keeps a
  person's identicon consistent between lobby preview, in-call avatar, and scheduled
  rooms. If that trade ever needs revisiting, the alternative considered was a
  room-scoped pseudonymous id (an HMAC of profile id + room code) — at the cost of the
  same person wearing a different identicon per room and per surface.
- **Signed-out guest UUIDs are server-generated** via `crypto.randomUUID()` so a guest can't choose a UUID that yields a targeted identicon. For them the lobby's preview identicon uses a throwaway client UUID and intentionally won't match the in-call one — identicons are abstract, not identity. A signed-in joiner has no such gap: their lobby preview and their in-call avatar are both their `profiles.id`.
- **Create / end require admin or a certified gedu** (`requireRole(["admin","gedu"], { requireCertifiedGedu: true })`). End has no per-room ownership check — any mod with the code can end any room (mods are trusted; there's no room-ownership concept). End treats a Daily 404 as a no-op success.
- **Code enumeration** is a real but bounded risk: brute-forcing ~1M codes finds active rooms, but a hit only joins as a guest and a mod can end the call. Per-IP rate limiting on the token endpoint is the mitigation (not yet built).
- **CSRF on the public token endpoint** doesn't meaningfully apply: it's unauthenticated, mints only a public-room token, and SameSite=Lax keeps the admin session off cross-site POSTs. Accepted.

## API routes (`src/app/api/voice/instant/`)

| Route | Method | Auth | Notes |
|---|---|---|---|
| `create` | POST | admin / certified gedu | No body. Mints code, creates Daily room with `exp = now + INSTANT_ROOM_EXP_SECONDS`, retries on duplicate name. Returns `{ code }`. Uncertified gedu → 403 `GEDU_UNCERTIFIED`. |
| `token` | POST | **public** | Body `{ code, displayName, micOn, cameraOn }`. Validates code, detects auth, verifies the Daily room exists (404 → `{ error: "room_not_found", code }`), mints a token. `displayName` is read **only** when no session resolves to a profile — required and length-checked there, and ignored entirely for anyone signed in (moderator or not). Returns `{ token, roomUrl, role, userId, displayName }`. |
| `exists` | GET | **public** | `?code=`. Cheap pre-flight so the not-found screen can render before burning the camera/mic prompt. **Returns 204 (not 200) on success, 404 when missing.** Clients must branch on `=== 404`, not `=== 200`. |
| `end` | POST | admin / certified gedu | Body `{ code }`. `DELETE`s the Daily room (ejects all participants). Daily 404 → 204 no-op (and, like the lazy-create probe miss, deliberately not logged at error level — "already gone" is an answer, not a failure). Returns 204. |

`micOn`/`cameraOn` default to mic-on / camera-off when absent. Token `exp` matches `INSTANT_ROOM_EXP_SECONDS` from each participant's own join; the room's `eject_at_room_exp` lands first in practice, so the per-token cap is just a per-participant ceiling.

## Components (this directory)

- **`InstantVoiceSession`** — the state-machine orchestrator. Wraps `VoiceRoomProvider`; phases `checking → lobby → in-call → ended | not-found`. On mount pings `exists` (non-404 → lobby, so a transient error still lets the join attempt surface the real failure). Holds the leave/end logic and the `userLeftRef` sentinel.
- **`InstantVoiceLobby`** — pre-join preview, shown to **everyone**: it is the device-prep screen, not a guest formality. Live avatar (speaking glow via `use-local-stream-glow`, camera-in-circle, mic indicator) mirroring the in-call avatar, mic/cam toggles, the room link, and — for signed-out visitors only — a name input. The viewer's identity arrives as a server-computed `{ id, firstName } | null` prop threaded from the page; the lobby reads no client-side auth of its own, because a stale browser session singleton disagreeing with the token route is exactly the drift to avoid. Acquires `getUserMedia` on mount; camera starts off; toggles flip track `enabled` instead of re-prompting.
- **`EndCallModal`** — leave confirmation. Guests get "Leave call"; mods additionally get "End for everyone" as the **destructive middle action** (so a fast click on the affirmative only leaves the mod, never nukes the call). The row runs Cancel, End for everyone, Leave — the three-or-more spine from the root `CLAUDE.md` "Button Order" rule, so naming that middle button by position would be wrong in one of the two layouts.
- **`CallEndedScreen`** — dead-end after the call wraps. `reason: "left"` (reassuring, shows the `RoomLinkChip` to rejoin) vs `"ended"` (hard close). Reuses the home-hero tagline + a server-rendered copyright slot (threaded in to avoid year-boundary hydration mismatch). No "return home" / "create new" buttons.
- **`RoomNotFoundScreen`** — echoes the entered code char-by-char for typo-spotting; offers mods a shortcut to create a fresh room.
- **`RoomLinkChip`** — the one click-to-copy affordance for a room link, in two variants. `full` (default) shows the host-relative URL in a wide chip with a hint: create card, lobby, "you left" screen. `compact` shows just the code in a small bordered button, for a spot where the link shares a row with other content — the in-call title row, via `VoiceRoom`'s `titleAccessory` slot. Both copy the same absolute URL through the same hook. **Rule: a new home for the room link takes a variant of this component, not a hand-rolled copy button** — the last one of those was the special header's, and it drifted.
- **`CreateInstantRoomCard`** — dashboard panel: idle "Create voice room" button → URL chip + Join after creation.

Shared pieces live in the parent (`VoiceRoomProvider`, `VoiceRoom`, `ZoneList`, the zone cards/avatars) and `../hooks/` (`use-local-stream-glow` drives the lobby glow from a raw `getUserMedia` stream, paralleling `use-speaking-glow` which reads from Daily). See `../CLAUDE.md`.

## Call-ended flow & the leave sentinel

When a mod ends for everyone:

1. Client broadcasts `{ type: "callEndedByMod" }` via `sendAppMessage("*")` **before** deleting the room, so peers transition to the friendly ended screen ahead of the disconnect.
2. Client `POST`s `end` (best-effort — a failed delete still leaves the local user disconnected; the room hangs until `exp`).
3. Daily disconnects everyone. Peers that caught the broadcast show the ended screen immediately; peers that missed it fall through the same `left-meeting` path to the same screen.

`userLeftRef` distinguishes a user-initiated leave (`reason: "left"`, room stays open) from a forced disconnect (`reason: "ended"`). 

**Rule: When the user initiates a leave/end, set `userLeftRef` true before awaiting `leave()`, and roll it back if `leave()` throws.** Without the rollback, a later Daily-side disconnect would silently pass through the auto-end path because the sentinel was already set, and the modal couldn't recover for a retry.

## Conventions inherited from the root CLAUDE.md

- **Loading & disabled state.** Create/join buttons use the committing-state pattern: a local boolean flipped true synchronously before the fetch, never cleared on the success path that navigates/unmounts (only on error/retry paths). Do not extract this into a shared hook.
- **All copy is translated** (`voice.instant.*` message keys), no hardcoded user-facing strings, no emoji in messages.
- **Colors come from semantic Tailwind classes / CSS vars** (`text-destructive`, `border-success`, …), never raw color classes.
- **No layout shift** once real content is painted; reserved label heights and fixed-min-width toggles in the lobby exist for this reason.

## Known gaps / future work

- Per-IP rate limiting on `token` (closes the enumeration window) and per-creator caps on `create` for gedus.
- Permanent kick / ban-from-room (between "mute one" and "end the call" there's no "remove this person and keep them out").
- Role badges in the voice UI + name-impersonation handling (a signed-out guest can name themselves "Admin Bob"; addressing badges and a name filter together is worthwhile, either alone is weak).
- Continued mobile-UX polish of the zone-card layout on narrow viewports.

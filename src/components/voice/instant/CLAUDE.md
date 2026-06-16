# Instant Voice Rooms

On-the-fly voice rooms any admin or gedu can spin up, share via a short URL, and let anyone (signed-in or not) join. Distinct from the schedule-driven group voice rooms — those are documented in `../CLAUDE.md`.

## Flow

A moderator (admin or gedu) creates a room from `/admin/voice` or `/gedu`. The server allocates a 4-character code, asks Daily.co to create a room named with that code, and returns the code. The dashboard shows a copyable URL chip + a Join button. The mod shares `/voice/{CODE}` with whoever should join. Anyone with the link joins, no account required. The room dies when a mod clicks "End for everyone" or after the room's `exp` (8h), whichever comes first.

## No database

**There is no `instant_voice_rooms` table.** The 4-character code IS the Daily.co room name, and Daily is the only source of truth for a room's existence and lifetime. "Never existed", "ended", and "expired" all collapse to the same Daily 404, and the UX treats them identically (one not-found screen, code echoed back for typo-spotting). Consequences:

- Room creation gets the URL back immediately — there's nothing to list, so no list endpoint.
- Daily's `exp` handles cleanup; no cron.
- Empty rooms cost nothing (Daily bills per participant-minute), so an abandoned room just idles until `exp`.

**Rule: Do not add a DB table to track instant rooms.** If you need room state, read it from Daily. Adding a table reintroduces a sync problem the design deliberately avoids.

## Code format & collisions

Codes are 4 characters from a 32-symbol alphabet — `A-Z` minus `I`/`O`, `2-9` (no `0`/`1`) — the glyphs humans confuse least when reading aloud or typing. ~1M unique codes. Generation, validation, and normalization live in `src/lib/voice-room-code.ts`.

**Rule: Every code crossing a trust boundary (URL param, request body) must be validated/normalized through the `voice-room-code` helpers before any Daily API call.** Validate-then-uppercase via `normalizeVoiceRoomCode` (returns `null` on anything malformed); never hand-roll the regex. This is the SSRF/path-injection guard — a raw code interpolated into a Daily REST path is the vector. Disallowed glyphs are rejected, not remapped (mapping `0→O` would hide typos).

We don't pre-check codes for collisions. Create attempts a Daily room with the random name; on Daily's duplicate-name error it retries with a fresh code (capped by `VOICE_CONFIG.INSTANT_ROOM_CREATE_MAX_RETRIES`). No DB lookup, no race window. Do not switch this to a get-or-create helper: a random code isn't authorization-gated, so silently joining an existing room on collision would leak someone else's room.

## Permissions

Auth is detected server-side at the token endpoint and **never** trusted from the client.

| Visitor | `is_owner` | Identity | Permissions |
|---|---|---|---|
| Signed-in admin / gedu | true | `profile.id`, `profile.first_name` | Full mod (mute, lock, screen-share, end) |
| Signed-in parent / gamer | false | server UUID + lobby name | Guest — auth ignored |
| Signed-out | false | server UUID + lobby name | Guest |

A voice "guest" is permission-equivalent to a gamer: no mute/lock/screen-share, can only drag own avatar, no broadcast zone. The voice role union is `UserRole | "guest"` — `"guest"` is display-only; all gating uses positive `role === "admin" || role === "gedu"` mod checks, so guest behavior falls out for free.

**Rule: Token ownership is computed only from the server session (`getUserWithProfile`), never from the request body.** Body fields named `isOwner`/`role`/`userId` are ignored by design (pinned by an integration test). On any auth-detection failure — no session, profile lookup error, role not admin/gedu — fall through to the guest path. There must be no path where ambiguous auth grants ownership.

## Security model

The room is open by design; defenses target privilege escalation and bounding blast radius, not gatekeeping entry.

- **Daily-signed `is_owner` is the real authority.** Tokens are signed with `DAILY_API_KEY` server-side; nothing client-supplied confers mod power. Display-name role badges (if any) are cosmetic.
- **Display-name pipe injection.** Daily `user_name` is encoded `userId|role|displayName`. `buildUserName` strips `|` from the display name so a guest can't inject a fake role slot. Cosmetic-only fix (the signed token wins) but keep it.
- **Guest UUIDs are server-generated** via `crypto.randomUUID()` so a guest can't choose a UUID that yields a targeted identicon. The lobby's preview identicon uses a throwaway client UUID and intentionally won't match the in-call one — identicons are abstract, not identity.
- **Create / end require admin or gedu** (`requireRole(["admin","gedu"])`). End has no per-room ownership check — any mod with the code can end any room (mods are trusted; there's no room-ownership concept). End treats a Daily 404 as a no-op success.
- **Code enumeration** is a real but bounded risk: brute-forcing ~1M codes finds active rooms, but a hit only joins as a guest and a mod can end the call. Per-IP rate limiting on the token endpoint is the mitigation (not yet built).
- **CSRF on the public token endpoint** doesn't meaningfully apply: it's unauthenticated, mints only a public-room token, and SameSite=Lax keeps the admin session off cross-site POSTs. Accepted.

## API routes (`src/app/api/voice/instant/`)

| Route | Method | Auth | Notes |
|---|---|---|---|
| `create` | POST | admin/gedu | No body. Mints code, creates Daily room with `exp = now + INSTANT_ROOM_EXP_SECONDS`, retries on duplicate name. Returns `{ code }`. |
| `token` | POST | **public** | Body `{ code, displayName, micOn, cameraOn }`. Validates code, detects auth, verifies the Daily room exists (404 → `{ error: "room_not_found", code }`), mints a token. `displayName` required + length-checked on the guest path, ignored for mods. Returns `{ token, roomUrl, role, userId, displayName }`. |
| `exists` | GET | **public** | `?code=`. Cheap pre-flight so the not-found screen can render before burning the camera/mic prompt. **Returns 204 (not 200) on success, 404 when missing.** Clients must branch on `=== 404`, not `=== 200`. |
| `end` | POST | admin/gedu | Body `{ code }`. `DELETE`s the Daily room (ejects all participants). Daily 404 → 204 no-op. Returns 204. |

`micOn`/`cameraOn` default to mic-on / camera-off when absent. Token `exp` matches `INSTANT_ROOM_EXP_SECONDS` from each participant's own join; the room's `eject_at_room_exp` lands first in practice, so the per-token cap is just a per-participant ceiling.

## Components (this directory)

- **`InstantVoiceSession`** — the state-machine orchestrator. Wraps `VoiceRoomProvider`; phases `checking → lobby → in-call → ended | not-found`. On mount pings `exists` (non-404 → lobby, so a transient error still lets the join attempt surface the real failure). Holds the leave/end logic and the `userLeftRef` sentinel.
- **`InstantVoiceLobby`** — pre-join preview: live avatar (speaking glow via `use-local-stream-glow`, camera-in-circle, mic indicator) mirroring the in-call avatar, mic/cam toggles, and a name input for guests only (mods use their profile name). Acquires `getUserMedia` on mount; camera starts off; toggles flip track `enabled` instead of re-prompting.
- **`EndCallModal`** — leave confirmation. Guests get "Leave call"; mods additionally get "End for everyone" as the **secondary/destructive** button (so a fast click on the primary only leaves the mod, never nukes the call).
- **`CallEndedScreen`** — dead-end after the call wraps. `reason: "left"` (reassuring, shows the `RoomLinkChip` to rejoin) vs `"ended"` (hard close). Reuses the home-hero tagline + a server-rendered copyright slot (threaded in to avoid year-boundary hydration mismatch). No "return home" / "create new" buttons.
- **`RoomNotFoundScreen`** — echoes the entered code char-by-char for typo-spotting; offers mods a shortcut to create a fresh room.
- **`RoomLinkChip`** — shared click-to-copy URL chip used by both the create card and the "you left" screen. Shows the host-relative URL but copies the full URL with protocol.
- **`InstantVoiceHeader`** — simplified header for `/voice/[code]` (no sidebar/footer; replaces the main app `Header`). The "SOG Sogverse" mark is a non-link `<div>` on purpose — navigating home would yank the user out of an active call. Right side: a copy-room-URL button + `LocalePicker`. Outer chrome comes from `SiteHeaderShell` so brand tweaks carry over.
- **`CreateInstantRoomCard`** — dashboard panel: idle "Create voice room" button → URL chip + Join after creation.

Shared pieces live in the parent (`VoiceRoomProvider`, `SpatialVoiceRoom`, the spatial canvas/avatars) and `../hooks/` (`use-local-stream-glow` drives the lobby glow from a raw `getUserMedia` stream, paralleling `use-speaking-glow` which reads from Daily). See `../CLAUDE.md`.

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
- Role badges in the voice UI + name-impersonation handling (a guest can name themselves "Admin Bob"; addressing badges and a name filter together is worthwhile, either alone is weak).
- Mobile UX for the spatial canvas on narrow viewports.

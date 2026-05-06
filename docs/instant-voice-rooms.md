# Instant Voice Rooms

On-the-fly voice rooms that any admin or gedu can spin up, share via a short URL, and let anyone (authenticated or not) join. Distinct from the schedule-driven group voice rooms documented in [voice-chat-architecture.md](./voice-chat-architecture.md).

## Overview

A moderator (admin or gedu) creates a room from `/admin/voice` or `/gedu/voice`. The server allocates a 4-character code, calls Daily.co to create a matching room, and redirects the moderator to `/voice/{CODE}`. The mod copies the URL from the header and shares it with whoever should join. Anyone with the link can join, no account required. The room dies when a moderator clicks "End for everyone" or after 8 hours, whichever comes first.

## Component Map

```
Pages
├── /{admin,gedu}/voice  → Single-button create page (dashboard)
└── /voice/[code]        → Public lobby + in-call (simplified chrome, no sidebar)

API routes (src/app/api/voice/instant/)
├── create/route.ts  — POST: Mint code + create Daily room (admin/gedu only)
├── token/route.ts   — POST: Issue Daily token (PUBLIC — auth optional)
└── end/route.ts     — POST: Delete Daily room (admin/gedu only)

Components (src/components/voice/instant/)
├── InstantVoiceHeader   — "SOG Sogverse" non-link, copy-code button, locale picker
├── InstantVoiceLobby    — Camera/mic preview, name input, identicon preview
├── InstantVoiceSession  — State machine orchestrator (lobby → in-call → ended)
├── EndCallModal         — Mod choice: Leave call vs End for everyone
├── CallEndedScreen      — Friendly dead-end with mission copy
└── RoomNotFoundScreen   — Echoes entered code, suggests typo check

Utilities
├── src/lib/voice-room-code.ts  — Code generation + format validation
└── src/lib/daily.ts            — Shared Daily.co REST wrapper (existing)
```

## Architecture

**No database table.** The 4-character code IS the Daily.co room name. Daily is the only source of truth for room existence and lifetime. There is no `instant_voice_rooms` table to keep in sync.

Why no DB:
- We don't need to list rooms — a moderator creates one and immediately gets the URL
- Daily's `exp` property handles cleanup; no cron needed
- Empty rooms cost nothing (Daily charges per participant-minute)
- "Room ended" and "room expired" and "room never existed" all collapse to the same Daily 404, and that's fine for the UX (see "Room not found" below)

### Code format

4 characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols — letters minus `I`/`O`, digits minus `0`/`1`). Yields 32⁴ = 1,048,576 unique codes. Case-insensitive in URLs, normalized to uppercase server-side. Easy to read aloud, type, or paste.

### Collision handling

Per-creation collision probability with 500 concurrent rooms is ~1 in 2,100 (~5/year at 10K creates/year). We don't proactively check for collisions — instead we let Daily's `POST /rooms` return 409 on a duplicate name and retry with a fresh code (max 3 attempts). Cleaner than a DB lookup, no race window.

### Room lifecycle

| Event | What happens |
|---|---|
| Mod clicks "Create voice room" | `POST /api/voice/instant/create` → mint code → Daily `POST /rooms` with `properties.exp = now + 8h` → return code → client navigates to `/voice/{CODE}` |
| Anyone visits `/voice/{CODE}` | Lobby renders → user sets name + checks cam/mic → `POST /api/voice/instant/token` → join Daily room |
| Mod clicks "End for everyone" | Broadcasts `callEndedByMod` app message → `POST /api/voice/instant/end` → Daily `DELETE /rooms/{CODE}` → all participants disconnected → all clients show CallEndedScreen |
| 8h passes | Daily destroys the room automatically; subsequent join attempts get the "room not found" page |
| Everyone leaves but no one ends | Room sits idle until 8h `exp`. No participants = no Daily charges. |

## Permissions Model

Auth is detected at the token endpoint. The server NEVER trusts client-supplied role/owner data.

| Visitor | Token `is_owner` | Identity source | Permissions |
|---|---|---|---|
| Authenticated admin | true | profile.id, profile.display_name | Full mod (mute, lock, screen-share, end) |
| Authenticated gedu | true | profile.id, profile.display_name | Full mod (same as admin) |
| Authenticated parent | false | server-generated UUID, lobby name input | Same as guest — auth ignored |
| Authenticated gamer | false | server-generated UUID, lobby name input | Same as guest — auth ignored |
| Unauthenticated | false | server-generated UUID, lobby name input | Same as guest |

A "guest" in the voice context is the same as a gamer for permission purposes — no mute, no lock, no screen-share, can only drag own avatar, can't enter broadcast zone. We add `"guest"` as a fourth value to the voice role union (`UserRole | "guest"`) for client-side display only; gating logic uses positive "is mod" checks (`role === "admin" || role === "gedu"`) so guest behavior is correct without further changes.

## Security Model

The room is open by design — anyone with the link joins. The defenses are around (a) preventing privilege escalation (a guest acting as a mod) and (b) limiting the blast radius of someone who finds an active code.

### Mitigations in place

| Vector | Mitigation |
|---|---|
| **Display-name pipe injection** — encoding is `userId\|role\|displayName`; a guest naming themselves `x\|admin\|Bob` could spoof their role badge in the client parser | Strip `\|` from any displayName before encoding the token's `user_name` field. Cosmetic only — Daily's signed `is_owner` is the real authority — but worth fixing |
| **Client supplies `isOwner: true` in token-request body** | The token endpoint computes `isOwner` purely from `getUser()` + profile lookup. Body fields named `isOwner`, `role`, `userId` are ignored by design (covered by integration test) |
| **Auth-detection failure treated as mod** | The token endpoint defaults to the guest path on any failure (no user, profile lookup error, role mismatch). There is no scenario where ambiguous auth grants ownership |
| **Forged Daily token** | Tokens are signed by Daily's API with our `DAILY_API_KEY`. Cannot be forged client-side |
| **Path injection / SSRF via code** | All endpoints validate `code` matches `/^[A-HJ-NP-Z2-9]{4}$/` before any Daily API call |
| **Guest-supplied UUID for identicon spoofing** | Guest UUIDs are generated server-side via `crypto.randomUUID()`. Client only renders the identicon, never picks the seed |
| **Non-mod creates rooms** | `requireRole(["admin", "gedu"])` on the create endpoint |
| **Non-mod ends rooms** | `requireRole(["admin", "gedu"])` on the end endpoint |

### CSRF on the public token endpoint

`/api/voice/instant/token` is unauthenticated, so traditional CSRF (forcing a victim's session to do something they didn't intend) doesn't apply — there's no session-bound state change. The closest concern is a malicious page auto-POSTing to the endpoint to mint a Daily token. The cost is low: the response is just a token for joining a public room (which the attacker could have minted directly), and SameSite=Lax cookies prevent the admin's session from being attached cross-site. We accept this risk for v1.

### Code enumeration risk

A motivated attacker could brute-force the 1M code space to find active rooms. With ~500 concurrent rooms, that's roughly 1 hit per 2,000 attempts. Even on a hit, the attacker joins as a guest — no mute, no lock, no screen-share — and a moderator can end the call. Real risk but bounded. Per-IP rate limiting on the token endpoint would shut this down; tracked under Future Improvements.

### Display-name impersonation

A guest can name themselves "Admin Bob" in the lobby. Today the voice UI does not show role badges, so other participants would have no visual signal that this guest isn't a real admin. Mod *actions* (mute/lock initiated by a real mod) would still be visible, and a real admin's identicon and Daily-side `is_owner` are unforgeable, but the social-engineering surface exists. We considered a name-blocklist filter (`/^(admin|moderator|educator|gedu)/i`) but it's whack-a-mole. Tracked under Future Improvements alongside "show role badges in voice UI" — addressing both together is more useful than either alone.

## API Endpoints

### `POST /api/voice/instant/create`

**Auth:** Admin or Gedu.

**Request:** No body.

**Response:**
```json
{ "code": "K7P2" }
```

**Behavior:** Generate a code, attempt `Daily POST /rooms { name: code, properties: { exp: now+8h, ... } }`. On 409 (collision), generate a new code and retry. Max 3 retries before failing.

### `POST /api/voice/instant/token`

**Auth:** Public. Auth state is read but never required.

**Request:**
```json
{ "code": "K7P2", "displayName": "Bob" }
```

`displayName` is required for the guest path, ignored for the mod path (we use `profile.display_name`). All other body fields are ignored — `isOwner`, `role`, `userId`, etc., cannot be supplied by the client.

**Response (success):**
```json
{
  "token": "<daily-meeting-token>",
  "roomUrl": "https://<domain>.daily.co/K7P2",
  "role": "admin" | "gedu" | "guest",
  "userId": "<uuid>",
  "displayName": "Bob"
}
```

**Response (room missing):** 404 with `{ "error": "room_not_found", "code": "K7P2" }`. The page renders RoomNotFoundScreen with the entered code echoed back.

### `POST /api/voice/instant/end`

**Auth:** Admin or Gedu.

**Request:**
```json
{ "code": "K7P2" }
```

**Response:** 204 on success.

**Behavior:** Validate code format. Call `Daily DELETE /rooms/{code}`. All connected participants are disconnected by Daily; their clients show CallEndedScreen.

## Page Layout

The `/voice/[code]` route uses its own layout (`src/app/(voice)/voice/[code]/layout.tsx`) that bypasses the standard app chrome. There is no sidebar, no main app header, no footer. The only chrome is `InstantVoiceHeader`:

- **Left:** "SOG Sogverse" rendered as a `<div>` (not a `<Link>`) — visually identical to the main app logo but does not navigate. Intentional: clicking should not yank the user out of an active call.
- **Right:** A button showing the room code; click copies the full room URL to clipboard. The locale picker sits next to it (reuses `<LocalePicker>` verbatim).

The text and styling come from translations and global CSS variables, so the simplified header automatically tracks brand changes made to the main `Header`.

## Call-Ended Flow

When a moderator selects "End for everyone":

1. Client broadcasts `{ type: "callEndedByMod" }` via `sendAppMessage("*")` so other clients can transition to CallEndedScreen with friendly copy before the disconnect lands.
2. Client calls `POST /api/voice/instant/end`.
3. Server calls `Daily DELETE /rooms/{code}`.
4. Daily disconnects every participant.
5. Clients that received the broadcast show CallEndedScreen immediately. Clients that missed it see a `left-meeting` event with a non-user-initiated reason and fall through to the same screen — same final UX, no extra complexity.

CallEndedScreen is a dead-end page: short message acknowledging the call ended, plus a brief School of Gaming mission tagline. No "Return home" button, no "Create new room" button. The user can navigate elsewhere via browser tools if they want.

## Future Improvements

- **Per-IP rate limiting on `/api/voice/instant/token`** — closes the code-enumeration window. Bucket per IP, throw 429 after N attempts in M seconds.
- **Per-creator rate limiting on `/api/voice/instant/create`** — admin accounts are highly trusted and we can leave them uncapped. Gedus are also trusted but less so; a per-creator daily/hourly cap on gedu room creation would limit the blast radius of a compromised gedu account.
- **Permanent kick / ban-from-room moderator action** — today a mod can mute/lock a participant or end the whole call. Between those, there's no "kick this one person and don't let them rejoin." Worth adding for handling disruptive guests without nuking the call for everyone.
- **Display-name impersonation handling** — combination of (a) showing role badges in the voice UI so a fake "Admin Bob" guest is visually distinguishable from a real admin and (b) optionally a soft warning or blocklist on names matching mod-implying patterns. Address both together; either alone is weak.
- **Mobile UX** — the in-call spatial canvas is cramped on phones. Removing the sidebar from the dashboard chrome already gives this route some extra horizontal space, but the canvas itself needs work for narrow viewports.

## See Also

- [voice-chat-architecture.md](./voice-chat-architecture.md) — Schedule-driven group voice rooms (the original system).
- [chrome-webrtc-volume-bug.md](./chrome-webrtc-volume-bug.md) — Web Audio workaround that applies to both flavors of voice room.

# Instant voice rooms: standard chrome + signed-in identity

## Problem

The instant voice room page (`/voice/[code]`) carries two compromises from its launch era,
when the rest of the site was not yet production-ready:

1. **A special dumbed-down header.** `InstantVoiceHeader` (in
   `src/components/voice/instant/`) replaces the standard app `Header` for this one route:
   non-clickable logo, no nav, no auth section, plus a hand-rolled room-code
   click-to-copy button. The `(voice)` route group exists solely to opt the page out of
   the normal header. The site is now fully in production, so the special header is
   unjustified inconsistency — and its copy button duplicates the shared `RoomLinkChip`
   component that already exists in the same directory.

2. **Forced-guest joins.** A signed-in parent or gamer is deliberately joined as an
   anonymous guest: the token route discards their session, mints a throwaway UUID, and
   makes them type a display name in the lobby. That was a launch-time simplification.
   The intended behavior now: anyone signed in joins as themselves (their profile id and
   first name, their real identicon); only a signed-out visitor goes through the
   type-your-name guest path.

## Scale

Instant rooms are a shipped production feature used by admins and gedus to run ad-hoc
calls with families. The change is low-risk on the data side (instant rooms have no DB
tables), but the token route is a **public security boundary** — its invariants must be
preserved, and an integration test suite pins them.

## The decision

### Chrome

- The `(voice)` group's layout renders the **standard `Header`** above a flex-1 `<main>`,
  mirroring the `(public)` group's layout **minus the footer** — a call page should not
  carry a footer. The route group survives; its reason for existing changes from "replace
  the header" to "standard header, no footer, focused call layout". Rewrite its doc
  comment accordingly.
- **Delete `InstantVoiceHeader`** and the `voice.instant.header.*` message namespace from
  all five locales. The page's two render branches (valid code / malformed code) drop
  their header elements; the layout now provides chrome for both.
- The standard header's logo and avatar are live links, which means a mid-call tap can
  navigate away. Accepted: scheduled group voice rooms already render the standard header
  during calls, so this matches existing behavior (see Rejected alternatives).

### Room-code copy affordance (was in the special header)

- **Lobby:** render the existing `RoomLinkChip` (full URL variant, with hint) inside the
  lobby card, below the title/description block. The lobby component gains a `code` prop
  (the session orchestrator already holds the code).
- **In-call:** add a **compact variant** to `RoomLinkChip` — room-code label + code +
  copy icon, styled like the old header button (small, bordered, mono code, success state
  on copy; copies the full origin-prefixed URL exactly like the full variant, via the
  same `useCopyToClipboard` hook). `VoiceRoom` gains an optional accessory slot prop
  (e.g. `titleAccessory?: ReactNode`) rendered right-aligned on the same row as the
  "Voice room" title — the title block becomes a flex row with the accessory at the top
  right. Only the instant session passes it; group rooms are untouched.
- Strings: the compact variant's label/aria strings move into the existing
  `voice.instant.share.*` namespace (add `roomCode` and `copyLink`; `copied` already
  exists there). Translate in all five locales; `tlh` may have fun.
- Placement was agreed as "lobby + in-call top right on the title row, tweak after
  seeing it". Review happens in the running dev app — instant rooms cost nothing to
  create — not via a preview scene (the in-call UI needs a live Daily call; the style
  guide demos only `ZoneList`, not the `VoiceRoom` title row).

### Identity (dropping forced-guest)

The token route (`src/app/api/voice/instant/token/`) currently has two paths: moderator
(admin / verified gedu → owner token, profile identity) and guest (everyone else →
random server UUID + lobby-typed name). It gets **three**:

1. **Moderator** — unchanged. `instantRoomModerator()` remains the single owner-eligibility
   predicate; `is_owner: true`, profile identity.
2. **Signed-in non-moderator** (parent, gamer, unverified gedu) — **new**: identity from
   the server session (`userId` = profiles id, `displayName` = profile first name; the
   body's `displayName` is ignored, no length validation applies), but the token's role
   slot stays **`"guest"`** and `is_owner` stays false. Permissions are unchanged — this
   is an identity change only.
3. **Signed-out** — unchanged: random server UUID, lobby-supplied name validated against
   the shared display-name bounds, role `"guest"`.

The session lookup is `getUserWithProfile()`, which is request-`cache()`d, so reading it
alongside `instantRoomModerator()` does not double-fetch. All existing fail-closed
invariants hold: ambiguous auth (profile lookup error, verification lookup error) falls
through to the signed-out guest path, and the body still cannot supply role/owner/userId
(the zod schema keeps those fields unreadable).

### Lobby

- **The lobby (device-prep screen) is always shown, for everyone.** The only difference
  between visitors is the name input: it renders **only for signed-out visitors**.
  (Previously it rendered for everyone the server didn't consider a moderator.)
- The page stops computing `isModerator` and instead threads a server-computed viewer
  identity down through the session orchestrator to the lobby: `{ id, firstName } | null`
  from `getUserWithProfile()`. Null → signed-out → name input + client-generated preview
  identicon (unchanged behavior). Non-null → no name input, preview name = first name,
  lobby identicon = profile id — which now **matches** the in-call avatar for every
  signed-in user, not just mods (an improvement worth keeping the lobby comments honest
  about).
- The lobby drops its `useAuth()` usage entirely — the server-computed prop is the single
  source, avoiding the stale-browser-singleton drift the auth architecture warns about.
- The join submit passes an empty display name for any signed-in viewer (the server uses
  the profile name), and the typed name only when signed out.
- The in-call "End for everyone" gate is unchanged: it reads the role returned by the
  token response, which is `admin`/`gedu` only for owners and `guest` for everyone else.

## Rejected alternatives

- **Moving the route into the `(public)` group** instead of keeping `(voice)`: that
  layout adds the site footer, which does not belong on a live call page. The group's
  "no footer" property is deliberate and worth a group.
- **Keeping the logo non-clickable in the new chrome** (the old header's documented
  rationale — a tap yanks a user out of a call): scheduled group voice rooms already show
  the standard header with a live logo during calls. Consistency across the two voice
  surfaces wins; if mid-call misnavigation turns out to be a real problem it will show up
  on both surfaces and deserves a shared fix.
- **Putting the real role (`customer`/`gamer`/`gedu`) in the token's role slot for
  signed-in non-mods.** The role slot is the *permission* label, not identity: all voice
  UI gating is positive `role === "admin" || role === "gedu"`, so `"guest"` for every
  non-owner is what makes guest behavior fall out for free. Concretely, an unverified
  gedu carrying `"gedu"` in the slot would light up the cosmetic mod UI ("End for
  everyone") that the server would then 403 — the exact drift the old design guarded
  against. Identity (userId + displayName) is where "join as yourself" lives.
- **Deciding the name input from client-side `useAuth()`** instead of a server-computed
  prop: the browser client's session singleton can be stale (see the root CLAUDE.md auth
  rules), and the existing pattern here is "server decides, client displays". Threading
  the viewer identity from the server component keeps the lobby and the token route
  reading the same session.
- **Keeping `instantRoomModerator()` threaded to the page.** No longer needed there: the
  lobby's only moderator-dependent behavior was the name input, which is now
  sign-in-dependent. The predicate keeps one consumer (the token route's owner gate).
  The original "one predicate, two surfaces" rule existed so an unverified gedu wouldn't
  see the mod lobby (no name field) and then be 400-bounced by the guest-name
  requirement; that hazard **dissolves structurally** — a signed-in unverified gedu no
  longer needs a name at all. The colocated CLAUDE.md must be updated to tell this story.

## Steps

Branch off latest `dev` (`feat/instant-voice-standard-chrome`), or run the change through
`/worktree-flow`.

1. **Chrome swap.** `(voice)/voice/[code]/layout.tsx` renders `Header` + flex-1 main;
   rewrite its doc comment. Remove `InstantVoiceHeader` usage from both branches of the
   page. Delete `InstantVoiceHeader.tsx`. Verify with a grep that nothing references it.
2. **Copy chip.** Add the compact variant to `RoomLinkChip` (prop-switched; shared copy
   behavior and strings). Add the `titleAccessory` slot to `VoiceRoom` and render it
   top-right on the title row. Pass a compact `RoomLinkChip` from the instant session's
   in-call render. Add the full chip to the lobby card (new `code` prop). Add
   `share.roomCode` / `share.copyLink` strings; delete the `header.*` namespace — both in
   all five locale files.
3. **Token route.** Add the signed-in non-moderator path as decided above. Update the
   route's doc comments (they currently describe the discard-the-session behavior).
4. **Page → session → lobby.** Page computes the viewer identity from
   `getUserWithProfile()` and threads `{ id, firstName } | null` in place of the
   `isModerator` boolean. Lobby: name input on `viewer === null` only; identicon and
   preview name from `viewer` when present; drop `useAuth`; update the prop docs and the
   file-level comment (the "preview identicon won't match in-call" caveat now applies
   only to signed-out guests).
5. **Tests** (`tests/integration/api/voice-instant-token.test.ts`). Rewrite the
   signed-in parent/gamer cases: still `isOwner: false` and role `"guest"`, but userId =
   profile id and displayName = profile first name, with the body's displayName ignored.
   Invert the unverified-gedu name-requirement case (no 400 anymore; profile name used;
   still non-owner). Keep every Vector pin (body cannot grant ownership; fail-closed
   verification; pipe-stripping; signed-out guests still get random UUIDs and required
   names). Run `npx vitest run` on the file, then full `npm run test`, `npm run lint`,
   `npm run type-check`.
6. **Docs.** `src/components/voice/instant/CLAUDE.md`: permission table (signed-in
   parent/gamer/unverified-gedu rows now carry profile identity with guest permissions),
   the "one predicate, two surfaces" section (now one consumer; explain why the drift
   hazard is gone), the components list (remove `InstantVoiceHeader`, update
   `RoomLinkChip` and lobby entries), and the flow/security notes that mention the
   discarded session. `src/components/layout/CLAUDE.md`: the `(voice)` row in the
   route-group table. The comment in `site-header-shell.tsx` naming `InstantVoiceHeader`,
   and the root `src/app/layout.tsx` comment saying the voice group replaces the
   standard chrome.
7. **Review pass in dev.** Create an instant room; check the three visitor shapes
   (signed-out, signed-in parent/gamer, admin) and the chip in both homes. Placement
   tweaks to the title-row chip are expected and cheap here.

## Acceptance criteria

- `/voice/[code]` (valid, malformed, and not-found codes) renders the standard app
  header; no footer; locale picker still reachable (it lives in the standard header).
- Room link is copyable from the lobby and from the in-call title row; group voice rooms
  show no chip.
- Signed-out visitor: name input required, random identity — behavior identical to today.
- Signed-in parent/gamer/unverified gedu: no name input; joins with their real first
  name and profile identicon; **no moderator affordances**, and the token carries
  `is_owner: false` with role `guest`.
- Admin / verified gedu: unchanged owner path.
- `InstantVoiceHeader` and `voice.instant.header.*` are gone from the codebase (grep
  clean, all locales).
- `npm run lint`, `npm run type-check`, `npm run test` all pass; the token-route
  integration suite still pins every security vector.

## Constraints discovered while deciding

- **The token route's body schema is a security feature**: role/owner/userId are
  *unreadable*, not merely unread. The new signed-in path must keep identity sourced
  exclusively from the server session.
- **`parseUserName` throws on an unknown role slot**, and all client gating is positive
  admin/gedu checks — which is why the role slot stays `"guest"` for every non-owner
  (see Rejected alternatives) rather than gaining new values.
- **The lobby is always rendered for every visitor** — that was re-confirmed as the
  intended UX. Only the name input is conditional.
- **A signed-in gamer (a child) now shows their real first name** to everyone in an
  instant room instead of a chosen alias. Deliberate and accepted: it matches scheduled
  group rooms, which already broadcast profile first names, and room links are shared
  intentionally by a moderator.
- The `exists`, `create`, and `end` routes, the proxy's public-route list, and the
  scheduled-room voice stack need no changes; the page URL and route group name are
  unchanged, so nothing about CSP, PUBLIC_ROUTES, or Daily room naming moves.
- `SelectProfileHeader` is a *second* simplified header with a similar shape — it is not
  orphaned by this work and stays as is.

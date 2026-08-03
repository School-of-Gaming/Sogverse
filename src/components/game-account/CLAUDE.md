# Game accounts (Minecraft, Roblox)

A child's identity on a game platform, wherever it is shown. **Two components and
one row shape** cover every surface: `/settings`, the parent's gamer detail, gedu
registration, the admin user page, the admin gamer chip, the voice participant
row, and the gedu session roster.

## The shape

| Export | Use |
|---|---|
| `GameUsernameRow` | Read-only. Figure, username, status square. |
| `GameUsernameEditableRow` | Set a username for the first time *or* change one. |

**Rule: there is one row shape and one height, and no variant of either.** No
compact badge, no `size` prop, no skin-less form. A game identity is one thing
that renders one way, and the moment it can be two heights or two densities a
surface has to choose, two surfaces choose differently, and the component that
exists to stop rows twitching starts contributing its own inconsistency. The
height lives in one exported constant; only the figure's *width* is per-platform,
and only because the render's proportion is (a whole body is 1:2, a bust is 1:1).

**Rule: first capture is the same row, opened.** A surface with nothing saved
passes `autoEdit` and gets the row already in edit mode, with the input where the
name will be. A labelled input with a Verify button beside it and a preview row
underneath was the previous design and is explicitly rejected — it made a
register page meet the identity as a different, taller species than every other
page did.

**Rule: committing is verifying.** There is no Verify control, because a second
control asking "is that real?" is the question the commit already asks. Enter or
the tick closes the editor, the typed name appears immediately, and the lookup
runs with its spinner in the status square the tick will later occupy — a slot
that already exists at a fixed size, so nothing moves. A surface that wants a
Verify button back is asking for the rejected pattern.

## The four states

`unknown` (no username) · `unverified` (a name, no confirmed account) ·
`verified` (a name and an account key) · `checking` (a lookup in flight).

**Rule: a failed lookup is not a state.** It is an unverified account plus a
sentence. The name is still saved — it is the child's answer — and the reason is
rendered next to it. An earlier vocabulary carried `idle` and `invalid`; neither
is a state an account can be *in* (one described a component's lifecycle, the
other one lookup's outcome), and both evaporated on reload.

**Presence of the account key is the whole of "verified".** Nothing reads its
value, which is how a dashed Mojang UUID and a Roblox integer share one prop
without being pretended to be the same value space. Most callers hand over the
two columns they already hold and never mention status; `status` is an override
for a lookup a caller is running itself.

## Platform descriptors

Everything a platform does differently lives in one descriptor: its icon, its
username rule (imported from the module that also runs the lookup, so the field
and the server agree by construction), its figure's width and drawn placeholder,
and its verify adapter. Components are generic and render from it.

**Rule: components take a single platform.** A surface may end up showing only
the identity that matters for the product in front of the child; composing across
platforms is the caller's business, not the component's.

## The figure

**Rule: `avatarUrl` has three meanings, not two.** A string draws that image. An
explicit `null` draws the bundled inline SVG and does not go looking — what every
fixture surface passes, because a style-guide or preview page must not reach a
third-party host on load. **Omitting it lets the platform decide, and on
Minecraft that is a network request**: its skin host is addressable by username,
so a row holding a name already holds everything it needs. Roblox has no such
endpoint — an avatar there costs two server hops behind a per-IP rate limit — so
an omitted prop can only mean the placeholder, and a real one has to be handed in
by whoever resolved it server-side. A resolved Roblox URL is short-lived and must
never be persisted.

## Wiring a save

The editable row is **controlled**: it reports one commit and expects the value
back as a prop. It renders the in-flight name itself, but never owns the
committed one.

**Rule: the commit callback fires once, at the end, carrying the outcome** — the
canonical username if the lookup confirmed one, the typed name if it did not,
`null` if the field was cleared. Wire it to the feature's existing mutation and
let that mutation's own invalidation feed the row its new props. That loop is
what keeps a calling surface from holding a second copy of the username.

A server route that persists a username re-runs the platform lookup itself. That
is not redundant with the row's check: a client-verified name is not evidence.

## Testing

Unit tests mock both platform verify hooks — the adapter calls both
unconditionally (a hook cannot be called conditionally), so both must exist
whichever platform a case drives. The behaviours worth protecting are the
stale-response guard (a result the row no longer owns is discarded whole, and the
newer flight keeps its spinner), the synchronous close before the await, and both
modes declaring the same height at the same node.

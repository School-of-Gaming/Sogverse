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

**Rule: there is one row shape, and no size knob on it.** No compact badge, no
`size` prop, no skin-less form. A game identity renders one way, and the moment
it can be arbitrarily resized a surface has to choose, two surfaces choose
differently, and the component that exists to stop rows twitching starts
contributing its own inconsistency.

**The one permitted axis is `figure`: `"full"` or `"head"`** — how much of the
character is drawn, and therefore how tall the row is. It is a density decision,
not a size knob, and it exists because `full` was measurably too tall on two
specific surfaces, not because a caller might fancy something smaller. Heights
live in one exported record keyed by figure. **A third value needs a surface that
measurably needs it** — the size-variant sprawl this directory removed once is
exactly what a casual third value grows back into.

**`head` is for the two dense lists and nothing else: the voice participant row
and the admin gamer chip.** Everything else takes the whole figure — settings,
the parent's gamer detail, gedu registration, the admin user detail page, the
gedu session roster. A profile header or a form has the room; a list of eight
people in a rail does not. When a surface feels tight, check whether it is
actually a dense list before reaching for `head`.

**Rule: a surface that needs breathing room around the row buys it at the call
site, never by padding the component.** Only two places have wanted it, and a
margin on the row's own `className` is the whole fix there; baking spacing into
the component would loosen every other surface's rhythm to solve two pages'
problem, and the fixed-geometry promise is about the row's *box*, not about the
air around it.

Within `full` the figure's *width* is per-platform, because the render's
proportion is (a whole body is 1:2, a bust is 1:1). **Within `head` it is not:**
a Minecraft face render and a Roblox headshot are both square, so the compact row
has identical geometry on both platforms. That is the variant's quiet win, and it
is worth preserving — a per-platform head width would be reintroducing a
divergence that does not exist upstream.

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

Everything a platform does differently lives in one descriptor: its username rule
(imported from the module that also runs the lookup, so the field and the server
agree by construction), its figure's width and drawn placeholder, and its verify
adapter. Components are generic and render from it.

**The figure is the only thing that says which platform a row is about.** There
is no platform glyph beside the name — there was one, and once every row carried
a skin it was labelling something the picture already said. That is why the drawn
stand-ins differ in shape between platforms rather than sharing one generic
figure: a row with no picture yet still has to answer the question, and the
silhouette is now the only thing left to answer it with.

**Rule: components take a single platform.** A surface may end up showing only
the identity that matters for the product in front of the child; composing across
platforms is the caller's business, not the component's.

## The figure

**Rule: `avatarUrl` has three meanings, not two.** A string draws that image. An
explicit `null` draws the bundled inline SVG and does not go looking — what every
fixture surface passes, because a style-guide or preview page must not reach a
third-party host on load. **Omitting it lets the platform decide, and on
Minecraft that is a network request**: its skin host is addressable by username
for the body *and* the face alike, so a row holding a name already holds
everything it needs for either figure. Roblox has no such endpoint — either
render costs two server hops behind a per-IP rate limit — so an omitted prop can
only mean the placeholder, and a real one has to be handed in by whoever resolved
it server-side. A resolved Roblox URL is short-lived and must never be persisted.

**Rule: a surface showing many Roblox identities resolves them in one batched
call, not one per row.** The row takes a picture and never goes and finds one, so
whoever renders a list owns the lookup — and the naive shape of that is N
requests against a thumbnails API rate-limited per IP across the whole serverless
fleet, which a single roster can drain on its own. The API accepts many account
ids per request (on the order of a hundred), so a roster resolves every headshot
it needs in one call and hands each row its URL. This is the shape to build the
first production Roblox roster in; today only the style guide resolves anything,
and it resolves one handle.

**Minecraft escapes the *lookup* cost, not the *image* cost, and the difference
matters at list scale.** Its host is addressable by username, so a Minecraft list
of any length costs zero API calls — but every verified row still issues one
image request to that host, and the admin groups panel can hold fifty-plus chips.
The rows are `loading="lazy"`, so only what is scrolled to is fetched; that is
the whole mitigation, and it is enough at the sizes we have. A surface planning
on hundreds of simultaneously-visible figures needs a real answer (a sprite, a
cached proxy, or not drawing figures at that density) rather than this sentence.

**The URL a caller passes must match the figure it asked for**, which is why a
verification hands back one render per figure rather than a single picture: the
lookup resolves both in the same round trip, and the row picks the one it is
drawing. For Minecraft the compact render is the **flat face**, not the isometric
head — the 3D one leaves roughly a quarter of its square frame as transparent
padding and puts aliased diagonals on every edge, which at 32px reads as a
smudge, and it would break the identical-geometry property by not filling its
frame the way a Roblox headshot does.

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

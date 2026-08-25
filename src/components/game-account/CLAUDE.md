# Game accounts (Minecraft, Roblox)

A child's identity on a game platform, wherever it is shown. **Two components and
one row shape** cover every surface: `/settings`, the parent's gamer detail, the
add-gamer dialog, gedu registration, the admin user page, the admin gamer chip,
the voice participant row, and the gedu session roster.

**Four surfaces can write one**: a person's own settings, a parent editing their
child, a gedu editing a child on their own roster, and an admin editing anyone.
The admin one is the widest and is the only one that can reach an account it has
no relationship to — see "Wiring a save" for what authorizes it.

**The gedu surface covers both platforms, and *which* one it shows is the
product's decision rather than the reader's.** A roster shows one identity for
everybody on it, resolved from the product's topic: a Minecraft product's roster
shows Minecraft handles, a Roblox product's shows Roblox ones, and a product
about no single game account — which is most topics, since most name subject
matter rather than one piece of software — shows no identity cell at all. There
is one editor behind all three, taking the platform as a parameter, because the
interaction is the one thing the platforms share exactly; everything they differ
on already lives in the descriptor.

**A roster with no identity cell is shorter, and reserves nothing.** The
precedent is the adult seat, which has always rendered the same absence for the
same reason: a blank cell beside a pencil that edits an account the product has
no use for is an affordance pointing at nothing, and a slot held open for
something that cannot appear while the page is open is dead space. Neither
discriminator moves under the reader — a seat's holder and a product's topic both
arrive with the payload — so the shorter row costs no layout stability.

Both platforms are **persisted**, in one table each keyed by the profile
(`minecraft_accounts`, `roblox_accounts`), and the two are independent
throughout: a person may have given one handle, both, or neither, and no surface
treats one as implying the other. The account keys are deliberately *not* one
value space — a dashed Mojang UUID in a text column, a Roblox int64 in a bigint
one — and neither column is unique, because siblings sharing one game account
across two Sogverse accounts is a supported shape.

## The shape

| Export | Use |
|---|---|
| `GameUsernameRow` | Read-only. Figure, username, status square. |
| `GameUsernameEditableRow` | Set a username for the first time *or* change one. |
| `GameAccountField` | An editable row **wired to a save** — its picture, and the one sentence a failure gets. |
| `GameAccountCard` | That field inside a titled card, for a page giving each platform one. |

The first two are how an identity is *drawn*; the second two are how a surface
that owns one connects it to storage. **A surface that saves a game username
composes `GameAccountField` and supplies `onSave` — it does not wire a row up
itself.** Three pages did exactly that once, each with its own copy of the same
error handling, the same silhouette-vs-render decision and the same rethrow, and
the copies had already started to differ. The field is where a rule about saving
gets applied once instead of two times out of three.

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
the parent's gamer detail, the add-gamer dialog, gedu registration, the admin
user detail page, the gedu session roster. A profile header or a form has the room; a list of eight
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

**`autoEdit` is about what the surface is for, not about whether anything is
saved, and it never buys height.** Both modes declare the same height at the same
node, so opening a row costs nothing and closing one saves nothing — which means
the choice is only ever about how much the surface appears to be asking for. A
registration page opens its rows because typing a name is most of what that page
is: nothing is competing for the attention. A form whose subject is something
else — the add-gamer dialog, whose job is a name and a birthday — leaves them
closed, because two open text inputs among four fields read as two more things
being demanded rather than two things on offer. The pencil is the invitation.

**Rule: the status square is reserved wherever a check can run, and collapsed wherever one cannot.** On an editable surface the square is held open in every state so the spinner and then the tick land in a slot that already exists — that is the geometry rule the row is built around, and a roster of eight must not twitch mid-session. But a surface that only *reads* an account — a voice room, whose identity arrives on the Daily token and cannot change while the room is open — is holding that square for something that can never arrive, and an empty box between the username and whatever follows it reads as a rendering fault. Such a caller passes `statusSlot="collapsed"` and the square is drawn only when it has a tick or a spinner in it. A verified row and an unverified one then end at different widths, which is a true statement about two different accounts rather than a layout that moved.

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

Everything a platform does differently lives in one descriptor: its brand name,
an example handle for the input's placeholder, its figure's width and drawn
placeholder, and its verify adapter. Components are generic and render from it.

**Rule: a platform is the only authority on which of its own names exist, and we
hold no opinion about their shape.** There was a username rule on each
descriptor, shared with the wire schemas so the field and the server agreed by
construction — and they did agree, on something false. Both platforms issued
accounts long before they had signup validators, so live handles carry spaces,
run shorter than the modern minimum, and use characters the current rules refuse;
a check written from those rules told real children their own handle could not
exist, without ever asking. Agreeing by construction is worth nothing when what
both ends agree on is wrong.

**So the whole path is: normalize, bound the length, send it, let the platform
answer.** A name that resolves lands verified with the account key beside it; a
name that does not is stored unverified with the "couldn't find" sentence — which
is also where a lookup during an outage lands, and where a name we would once
have refused outright now lands too.

**What survives is the transport rule, and every part of it is a statement about
our own request and our own rendering rather than about names:**

- **Strip the Unicode format characters (category `Cf`)** — zero-width spaces and
  joiners, the BOM, the bidi controls. `.trim()` does not touch them, so without
  this a handle of nothing but invisible characters is stored and draws a row
  whose name looks blank, and an embedded `U+202E` visually reverses the span so
  the name on screen is not the name in the column. Neither platform issues a
  handle containing one, so nothing real is refused.
- **Then trim**, so a value that was only invisible characters (with or without
  spaces around them) comes out empty and is read as "no name here" — a clear,
  exactly like a blank field.
- **Then bound the length**: a cap generous enough that no real handle meets it,
  existing so an unbounded string cannot be put into a URL, a JSON body and a
  text column. One number, shared by both platforms. **Over it is the single
  refusal left on this path**; the two steps above never refuse anything, they
  only decide whether what is left is a name or a clear.

The order is fixed — strip, trim, bound, collapse-to-null — because each step
feeds the next, and it is restated identically in two layers: the wire schemas
(both platforms' value *and* query schemas) and the cheap local check inside each
lookup, which the write paths reach directly. The layers have to agree, or the
name asked about is not the name stored. The username inputs carry the same
length as a `maxLength`, so the bound is enforced before a name can be typed past
it rather than only on save.

The editor has no format branch either, for the same reason: every committed name
goes to the lookup, and a miss lands exactly where a miss has always landed.

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

**Rule: a stored Roblox account is resolved by its account id, never by its
name.** There are two lookups and they are not interchangeable. Verification
starts from a name nobody has confirmed and must spend a hop turning it into an
id; **loading a page starts from an id we already stored**, which is the fact —
the name is only its label. Going by id drops a third of the upstream calls,
needs no `users.roblox.com` call at all, and is the only form that batches.

There was a period where stored Roblox rows simply drew the silhouette until
someone re-saved them, on the reasoning that a picture was not worth three
upstream calls a view. That reasoning died with the id column: two calls, for any
number of accounts on the page, is worth it, and a verified row that showed a
green tick beside a grey silhouette read as a bug to the person looking at it —
because it was one.

**Rule: an *unverified* handle stays on the silhouette, and that is not a
performance decision.** It has no id, and resolving the *name* instead would draw
whichever stranger happens to own that name beside a child's. The verified gate
on the figure is the same rule the Minecraft skin derivation already obeys.

**Rule: a surface showing many Roblox identities resolves them in one batched
call, not one per row.** The row takes a picture and never goes and finds one, so
whoever renders a list owns the lookup — and the naive shape of that is N
requests against a thumbnails API rate-limited per IP across the whole serverless
fleet, which a single roster can drain on its own. The API accepts many account
ids per request (on the order of a hundred), so a roster resolves every render it
needs in one call and hands each row its URL. A per-row hook exists for the
single-identity surfaces and **must not be mapped over a list**.

**A list whose membership changes while the page is open needs the other batch,
and the two are not interchangeable.** The plain one is keyed by its whole id
set, so a changed set is a different question and is asked from scratch — correct
for a snapshot (the ids arrive with the page and the key collapses reorderings to
one entry), and quadratic for a voice room, where each join would re-ask about
everyone already resolved. The live one accumulates instead: an ever-seen set of
ids beside the resolved map, one request per change and only about the ids that
change brought, none at all for a change that brought no new verified account. An
id is marked seen before its request is sent, so a second change asks only about
its own newcomers while the first request is still in flight, and no two
responses can ever name the same id. Neither shape is ever a hook per row.

**The list's owner does the resolving, and on a page split into a data shell and
a presentational body that is the shell.** The body takes the answers as a prop,
keyed by account id, which is what lets the same body serve a live page and a
fixture-driven scene: the live shell hands down what it resolved, and a scene
hands down nothing, so a preview never reaches a third-party host on load. A body
that fetched for itself would make that impossible and would put the request
behind whichever surface happened to mount it.

**An id the caller has no answer for yet is the silhouette, not a loading
state.** A figure is decoration; the name and the tick are already on screen, the
box is already at its final size, and nothing about a picture arriving later is
worth a skeleton or a spinner.

**Two properties of the batch are load-bearing and easy to lose.** An answer is
matched to the id the *response* names, never to its position — the endpoint does
not promise an order, and a positional read hands one child another child's face,
which is the single failure mode worse than no picture. And the response names
**every** id it was asked about, including the ones with no render, so a caller
can tell "asked, and there is none" from "not asked yet" and settle on the
silhouette instead of waiting forever.

**Renders are never retried and never persisted.** A thumbnail is decoration: a
failed fetch degrades to the silhouette, and retrying would spend more of the
per-IP budget redrawing something nobody is waiting on. The URL is resolved once
per id per session — it addresses an immutable image and only changes when
somebody redesigns their avatar — but the JSON naming it is `no-cache` upstream,
so it is a session-lived value and never a column.

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

**Rule: a save that worked says so by changing the row, and a surface adds no
sentence of its own. Only a failure gets one.** The row is the receipt — the new
name is on screen, the tick lands beside it, the picture arrives in the box — and
a banner underneath repeating that in words is a second announcement of something
already visible. It also gets the emphasis backwards: it makes the ordinary path
the noisy one, on surfaces where an admin or a parent may save several times in a
row. A failure is different in kind, because it is the one outcome the row cannot
show on its own: the name is still there, saved and unverified, and only a
sentence can say why it did not take.

**That is a property of the shared field rather than a habit each page keeps**,
which is the point of it being shared: the field holds one `error` string and no
success state, cleared
at the start of each commit so a retry does not leave a stale reason under a row
that has since succeeded. The slot sits **below** the row — a banner above would
push the very thing the person just used — and on the ordinary path it renders
nothing at all, so nothing moves.

A server route that persists a username re-runs the platform lookup itself. That
is not redundant with the row's check: a client-verified name is not evidence. On
Roblox it is also the only honest way to obtain the account key at all — neither
of that platform's APIs is reachable from a browser, so a number arriving from
one could not have been looked up there.

**Rule: a write path that names a target must authorize the target, not just the
actor.** Three of the four write paths cannot name one at all — the self-serve
routes derive the row from `auth.uid()`, which is most of what makes them safe —
and the two that can (the gedu's group-member edit, the admin's user edit) each
answer it differently: the gedu's is settled inside the database by an RPC that
re-derives what that caller may touch — one per platform, each naming that
platform's columns and each carrying the same derivation — and the admin's is
settled in the route,
which refuses an id naming nobody and an id naming an account that cannot hold a
game identity. **Only a gamer or a gedu can**, because those are exactly the
roles the self-serve route is gated to; writing one onto a parent or an admin
would create a row no other path could have produced.

**An admin's write runs on their own user-bound client, not the service-role
one.** Both tables carry a `FOR ALL` policy over `is_admin()`, and `authenticated`
holds only SELECT/INSERT/UPDATE, so the role gate on the route and the policy
underneath it both have to agree before a row moves — and no path here can DELETE
at all. Reaching for the admin client would replace two independent checks with
one.

**Rule: a route stores the name it was sent and takes only the account key from
its own lookup.** The row already adopted the canonical casing before it
committed, so what reaches the server is what the person meant; a route that
quietly rewrote the name would be answering a question nobody asked it, and would
make the value in the database depend on when the lookup last ran. A name the
platform cannot resolve is stored all the same, with a null key — an unverified
name is still the child's answer, which is the whole of why `unverified` is a
state and a failed lookup is not.

**One route predates that rule and still adopts the spelling its lookup returned
— the gedu's Minecraft edit — and it is a known divergence rather than the
pattern to copy.** Its own test pins the behaviour, so changing it is a decision
with a test to rewrite; until somebody makes that decision, read the rule above
as the one a new write path follows and this sentence as the exception it has.

**A key the route did not obtain is *absent*, never a stand-in value.** Where an
RPC defaults its key argument to SQL NULL, the argument is omitted; there is no
number or string that means "not verified", and inventing one puts a value in a
column that has no business holding it. The `unverified` state is the absence,
which is the same thing the presence rule says from the other side.

**Rule: a mutation invalidates the stored rows, never a platform's whole cache
root.** The two branches under a platform's key hierarchy are not alike: one
holds rows we saved (indexed reads by primary key) and the other holds what the
platform told us (three upstream calls against a shared per-IP budget on Roblox).
Invalidating the root drags every mounted lookup into a refetch to re-learn an
answer the save did not change.

## Testing

Unit tests mock both platform verify hooks — the adapter calls both
unconditionally (a hook cannot be called conditionally), so both must exist
whichever platform a case drives. The behaviours worth protecting are the
stale-response guard (a result the row no longer owns is discarded whole, and the
newer flight keeps its spinner), the synchronous close before the await, and both
modes declaring the same height at the same node.

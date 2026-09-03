# Layout & Scroll Architecture

Shared layout chrome lives here: `header.tsx`, `site-header-shell.tsx`, `dashboard-layout.tsx`, `sidebar.tsx`, `footer.tsx`, plus `account-menu.tsx`, `locale-picker.tsx` and `copyright.tsx`. This file governs the scroll model these pieces depend on, and the header's account affordance.

## Core model

**The document is the single scroll container for every route group.** There are no inner `overflow-auto` panes. The page scrolls naturally, so `window.scrollY` reflects the real scroll position and native hash navigation, scroll listeners, and Playwright `elementFromPoint` all work without workarounds.

The shape per layout:

- Wrapper uses `min-h-screen` (a flex column for `(public)`/`(auth)`, a plain `flex` row for `(dashboard)`).
- The header renders in flow via `SiteHeaderShell` — a `position: sticky top-0 z-50` element sized by `var(--header-height)`. Sticky participates in normal flow, so it reserves its own slot; no wrapper needs a `pt-16`-style offset to clear it.
- Anything else that must stay visible while scrolling uses `position: sticky` (e.g. the dashboard sidebar), never a fixed-height scroll container.

Route-group wrappers:

| Group | Shape |
|---|---|
| `(public)` | `flex min-h-screen flex-col` → `<Header>` + `<main flex-1>` + `<Footer>` |
| `(auth)` | same as public, `<main>` centers its child |
| `(dashboard)` | `<Header>` then `DashboardLayout`: `<div className="flex">` → `<Sidebar>` (admin only) + `<main min-w-0 flex-1>` |
| `(voice)` | the `(public)` shape **minus the footer**: `<Header>` + `<main flex-1>`, nothing below it — a live call page shouldn't end in site nav |
| `(preview)` | pass-through layout — **no chrome at all**; each admin-only preview scene composes the shell of the page it mocks (see below) |

**A group earns its own entry by what it puts *around* the header, not by replacing it.** `(voice)` once existed to swap in a simplified header of its own; it now renders the standard one and keeps the group solely for the missing footer. If a future group wants only a different header, it wants a prop on the header, not a route group.

**Rule: the preview route group's layout stays a pass-through.** A full-page preview scene mocks a *specific* page, so it has to compose that page's chrome itself — a dashboard scene renders `Header` + `DashboardLayout` with no sidebar, a public scene renders `Header` + `main` + `Footer`. Putting any chrome in the group layout would either double-wrap a scene or force every scene into one role's shell, which is exactly what moving these routes out of the public group fixed. Adding a shell to a scene means naming it in the scene registry, not editing this layout.

## The cookie consent strip

The consent banner is rendered from the **root layout**, outside every route-group shell, so it is the one piece of chrome that belongs to no group and no header. It is `fixed inset-x-0 bottom-0 z-50`: **`fixed`, not `sticky`, precisely because it belongs to no scroll container** — everything else that stays visible while scrolling is a child of the thing it scrolls with (the header of the page, the sidebar of the dashboard row), and sticky positions an element inside its own flow. The strip is in nobody's flow; it is painted over whatever is on screen. That is also what satisfies the layout rule: it overlays rather than inserts, so an element the reader could be pointing at when the strip appears is in the same place afterwards, and the same when it goes.

It is deliberately **non-modal** — no backdrop, no focus trap, no scroll lock — and a `region` with an accessible name, so a reader can go on reading the page and answer whenever they like. Whether it shows is decided **on the server**, from the `sog_consent` cookie parsed in the root layout and seeded into the provider, so the first client render agrees with the SSR HTML and nothing appears or disappears at hydration. Its `z-50` matches the dialog portals', and the strip wins nothing by that: it is rendered as a sibling of `children` rather than portaled, so it is always earlier in the body than a runtime portal and an open dialog paints above it.

**It never renders under `/gamer`.** Consent to analytics and advertising is the parent's to give, and a child signing in through their parent's account is not the person to ask; nothing optional runs on a gamer surface anyway. That list is the banner's own and is deliberately shorter than the one the marketing pixels use — a login form or a staff page is a fine place to ask the question and a poor place to load an ad-platform script.

## The account menu

The header avatar is a dropdown, not a link (`account-menu.tsx`). It is the single account affordance on every page: the role's dashboard, the people the viewer can switch to, settings, and sign-out. There is no dropdown primitive in the kit, so it follows the locale picker's idiom — a `relative` wrapper, `useClickOutside`, an absolutely-positioned `role="menu"` panel — plus Escape-to-close with focus returned to the trigger, arrow-key movement across the rows (which is what the `menu` role promises), and a close when focus leaves the wrapper altogether, so tabbing past the last row does not leave a panel painted over a page the keyboard has already left.

**Rule: the trigger avatar is the identity; the menu is destinations only.** The viewer's own row is deliberately absent — the masthead pattern, where the face you are wearing sits on the button and the list holds only the faces you can put on instead. A row for the account you are already in cannot be clicked, and "who am I?" is answered better by the avatar the reader just pressed than by a row that has to explain why it does nothing. Two things follow and are not optional. The trigger's `aria-label` carries the viewer's **first name** (`header.accountMenu` takes a `{name}`), because an identicon says nothing to a screen reader and this is now the only place identity is stated. And the member rows carry a **"Switch to" heading** (`header.switchTo`): a household with one child leaves a parent looking at exactly one name, which without the heading reads as *who I am* rather than *where I can go*.

**Rule: opening always paints a whole menu, and the row set is snapshotted at that moment.** Parents and gamers get one row per *other* household member, read from the family list on *mount* rather than on open — but the panel never waits for that read. Holding it back would give a trigger saying `aria-expanded="true"` over an empty document for as long as a retry backs off, and since the settings cog left the header, Settings and Sign out would be unreachable for that whole window. So the menu opens instantly and always complete, and the household it lists is whatever had landed when the avatar was clicked, captured into state right there. **Rows never arrive into an open panel**: that would push Settings and Sign out down the list on the data's own schedule, which is the shift the root layout rule forbids. The next open shows the fuller list. No household in hand — a read in flight, a read that failed, or a role with nobody to switch to — simply means no member block, heading included; the heading lives inside that block precisely so it can never stand orphaned over no names. Admins and gedus never make the read at all (`/api/family/list` is gated to customers and gamers), and a disabled query still reads whatever sits in the cache under its key, so the role gate is applied to the *rows*, not only to the fetch.

**Rule: a member row is a destination and looks like one.** A trailing `NavChevron` (size `sm`) sits in a right-packed cluster with the parent's role descriptor — descriptor then chevron — which is what lets a descriptor appear on some rows and not others without the chevron moving. The fixed rows (dashboard, settings, sign-out) keep their leading-icon shape and take no chevron: the chevron marks the switch specifically.

**Rule: the row that was clicked wears a spinner, in the trailing slot, and every other row is disabled behind it.** A switch replaces the clicked row's chevron *in place*, so the mark swaps without moving anything. Sign-out has no chevron to replace, so its spinner **arrives** in an empty trailing slot instead — permitted because it lands at the end of the run and grows leftward into the row's own slack, leaving the icon and label already painted exactly where they were; nothing is reserved for it in advance. Both flags are set synchronously and neither is cleared on success, because success is a document unload. Sign-out is a native form POST, so it has no JS error path at all — `onSubmit` records the commit and lets the submit proceed, never `preventDefault`, never a fetch — and disabling the submit is what stops a second one.

**Rule: the arrow-key traversal skips only rows a switch in flight has taken out of service.** They are marked by a dedicated data attribute (plus `disabled` on the rows that are real buttons). Keying the skip on `aria-disabled` instead would be a selector that quietly swallows any future row announced as unavailable for some other reason.

**Rule: the close-on-focus-leave guard may not read the render it was dispatched into.** Committing a switch disables the row that has focus, and the browser answers *inside React's mutation phase* with a synchronous `focusout` that carries no `relatedTarget` at all. React dispatches that into the handler belonging to the render before the commit, where the busy flag is still false — so a guard reading its own closure closes the panel at the exact instant of the commit, taking the failure line down on one path and the sign-out spinner on the other. A layout effect is no better a source: it also runs after the mutation phase the event fires inside. The guard therefore defers its decision to a microtask, by which time the whole commit is behind it, and reads the state from refs mirrored in a layout effect. Where the browser gave no `relatedTarget`, the landing spot comes from the active element — which is `<body>` in exactly that disabled-row case, so the busy check is the half doing the work. Focus genuinely leaving the component still closes the panel, one microtask later. **jsdom does not blur an element it disables, so no test can stage this ordering** — the suite pins the resulting contract instead, and the reasoning has to live here.

**Rule: a failure is a state of one switch, not of the panel.** Three things follow, and each was a hole. The message is cleared when the menu is *opened*, so a later open is never greeted by an alert about something the reader has long since moved on from — the panel unmounts on close but the state does not. The clicked row gets focus back when the commit fails, because disabling it blurred it to `<body>` and re-enabling does not hand focus back; without that, arrow keys re-enter at the top of the list and a screen-reader user has no way back to the line they need to read. And the line is scrolled into view within the panel when it appears, because it is appended last inside a card that caps its height and scrolls: on a full household already scrolled down it would otherwise land below the fold and a failed switch would produce no visible change at all. Scrolling *down* to an appended line is what keeps this inside the layout rules — nothing already painted moves, which is also why the line must not be moved to the top of the panel to solve the same problem.

**Rule: a switch commits through one shared function, wherever it is initiated.** The commit — POST the switch, then leave the page — lives once in the family service layer and is called by the account menu, the profile selector and the confirm-switch dialog; it takes an optional redirect override, which is how the dialog carries an intent marker across the switch. It owns no state: a follow-up piece gates a gamer-initiated switch behind a parent-PIN dialog and will wrap exactly that function, and the three surfaces need genuinely different waits and failures, so each keeps its own local `committing` flag. That flag is set synchronously before the call and never cleared on success (the full-page navigation is what ends it); it is cleared only on failure, which surfaces as a *translated* line — the server's own English words go to the console — at the end of the panel, as a sibling of the `menu` element, since a menu's children have to be menu items. Nothing already painted moves. **The translated-line-plus-console policy binds all three surfaces**, not just the menu: a raw `err.message` is English server text (often a bare HTTP status) shown to a family who may be reading the product in Finnish, and it is the same defect wherever a switch is initiated from.

## `--header-height`

**Rule: Never hardcode the header height (`h-16`, `top-16`, `4rem`, `calc(100vh - 4rem)`, etc.) for anything that must line up with the header.** The height is owned by a single CSS variable `--header-height` in `src/app/globals.css`. Everything that aligns with the header reads from it: `SiteHeaderShell`'s own height, the sidebar's sticky `top` and explicit height, hash-anchor scroll margins, and the home hero's bleed-under-header trick. Change the variable and the whole layout follows; a hardcoded literal silently drifts when the header is resized.

## Sidebar

Only the admin dashboard renders a sidebar (`navItemsByRole` in `sidebar.tsx` is keyed by role and only `admin` has entries). Parents, gamers, and gedus reach their dashboards via header affordances and have no nested sub-routes needing nav.

The sidebar is `position: sticky; top: var(--header-height)` with an explicit `h-[calc(100vh-var(--header-height))]` and `self-start`. It sits in the dashboard flex row beside `<main>`. It works because:

- The dashboard wrapper's height is the natural height of its tallest child (`<main>`), which can exceed the viewport.
- `position: sticky` keeps the sidebar visible as the document scrolls past it.
- Explicit height + `self-start` override the flex default `align-items: stretch`, so the sidebar pins to the viewport-minus-header instead of matching `<main>`'s full height. Its internal `nav flex-1` + user-info layout keeps user info anchored to the bottom.

## `<main>` width

The dashboard `<main>` needs `min-w-0` so the flex item shrinks to its assigned width instead of growing to fit its widest unbreakable child. Without it, a long word (e.g. a Finnish/Swedish compound on the settings page) pushes `<main>` past the viewport and produces a stray horizontal scroll on narrow widths. (The `flex-col` public/auth layouts don't hit this — width is their cross axis.)

## The content gutter

**Rule: the dashboard layout owns the horizontal content gutter; a dashboard page body must not add its own.** The layout wraps every dashboard page in a padded content container (currently `p-6`), and that padding is the gutter at every breakpoint. A page body therefore sets only its **max-width** (`mx-auto max-w-*`) and its **vertical rhythm** (`space-y-*`, `pb-*`), and accepts the horizontal space it is given — no `px-*`, and no `container` class, which brings its own padding and a second set of breakpoint-dependent max-widths that fight the one the page just declared. Two gutters do nothing visible on the wide viewport a page is usually designed at and quietly eat a third of a phone screen, which is exactly where a dashboard page has the least room to spare; and a page that pads itself can only be re-gutted by editing every page.

The exception is a **deliberate full-screen bespoke layout** — a centered lock-screen panel, a split-pane tool — which owns its geometry end to end and is not a content page at all. Claiming the exception means being that bespoke; an ordinary content page that just wants different margins is not an exception, it is the rule being broken.

## Anchor links

**Rule: Hash-anchor target elements need `scroll-mt-[var(--header-height)]`** so they land below the stuck header instead of behind it. Use `scroll-mt-[calc(var(--header-height)+1rem)]` when you want a little breathing room above the target.

## Hard rule: do not reintroduce inner scroll containers

**Rule: Never put `h-screen overflow-auto` (or any fixed-height inner scroll pane) on a top-level layout container.** An earlier architecture made the root `<main>` a fixed-height scroll container so dashboard pages could derive heights from it. It cascaded: dashboard content overflowed and shoved the sidebar off-screen, a second document scrollbar appeared, the home hero collapsed to zero height, and `window.scrollY` / native hash nav / Playwright clicks / third-party scroll libs all broke and each grew its own workaround. The fix was to delete the whole inner-scroll model and adopt document scroll + `position: sticky`. If you reach for `h-screen overflow-auto` on a layout wrapper, stop — you are re-creating that cascade. The correct shape is `min-h-screen` wrapper, header in flow via `SiteHeaderShell`, document scroll, and `position: sticky` for anything that must stay visible.

## Scrollbar gutter (opt-in)

Because the document is the single scroll container, a page that flips between fitting the viewport and overflowing it makes the *document* scrollbar appear/disappear, shifting all content sideways. This bites list pages whose data loads in below the fold (and now any page whose filters can shrink the list back above the fold).

**Rule: To reserve the scrollbar gutter, render `data-reserve-scroll-gutter` on the page's root element — do not set `scrollbar-gutter` on a page-level `<div>`.** The gutter only has effect on the actual scroll container (the root element), so `globals.css` carries `html:has([data-reserve-scroll-gutter]) { scrollbar-gutter: stable; }`. The `:has()` keeps it opt-in: only pages that render the marker pay for the gutter, instead of forcing it on every route. Current opt-ins: the admin users page, the shared admin `ProductListPage` (the four product-list routes), and the shared public browse results (`/shop` and the `/schools/<municipality>` pages, whose chip filters can shrink the sections back above the fold). It's a no-op on overlay-scrollbar OSes (nothing to reserve).

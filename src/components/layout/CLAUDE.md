# Layout & Scroll Architecture

Shared layout chrome lives here: `header.tsx`, `site-header-shell.tsx`, `dashboard-layout.tsx`, `sidebar.tsx`, `footer.tsx`, plus `locale-picker.tsx` and `copyright.tsx`. This file governs the scroll model these pieces depend on.

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
| `(voice)` | page renders its own voice header (also via `SiteHeaderShell`) then session UI; no app chrome |

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

## Anchor links

**Rule: Hash-anchor target elements need `scroll-mt-[var(--header-height)]`** so they land below the stuck header instead of behind it. Use `scroll-mt-[calc(var(--header-height)+1rem)]` when you want a little breathing room above the target.

## Hard rule: do not reintroduce inner scroll containers

**Rule: Never put `h-screen overflow-auto` (or any fixed-height inner scroll pane) on a top-level layout container.** An earlier architecture made the root `<main>` a fixed-height scroll container so dashboard pages could derive heights from it. It cascaded: dashboard content overflowed and shoved the sidebar off-screen, a second document scrollbar appeared, the home hero collapsed to zero height, and `window.scrollY` / native hash nav / Playwright clicks / third-party scroll libs all broke and each grew its own workaround. The fix was to delete the whole inner-scroll model and adopt document scroll + `position: sticky`. If you reach for `h-screen overflow-auto` on a layout wrapper, stop — you are re-creating that cascade. The correct shape is `min-h-screen` wrapper, header in flow via `SiteHeaderShell`, document scroll, and `position: sticky` for anything that must stay visible.

## Scrollbar gutter (opt-in)

Because the document is the single scroll container, a page that flips between fitting the viewport and overflowing it makes the *document* scrollbar appear/disappear, shifting all content sideways. This bites list pages whose data loads in below the fold (and now any page whose filters can shrink the list back above the fold).

**Rule: To reserve the scrollbar gutter, render `data-reserve-scroll-gutter` on the page's root element — do not set `scrollbar-gutter` on a page-level `<div>`.** The gutter only has effect on the actual scroll container (the root element), so `globals.css` carries `html:has([data-reserve-scroll-gutter]) { scrollbar-gutter: stable; }`. The `:has()` keeps it opt-in: only pages that render the marker pay for the gutter, instead of forcing it on every route. Current opt-ins: the admin users page and the shared admin `ProductListPage` (the four product-list routes). It's a no-op on overlay-scrollbar OSes (nothing to reserve).

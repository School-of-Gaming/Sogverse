# Layout Scroll Architecture

## Current Design

The **document is the single scroll container** for every route group. There are no inner `overflow-auto` panes; the page scrolls naturally and `window.scrollY` reflects the user's actual scroll position.

```
<html>                                  default (overflow: visible)
  <body>
    <Header />                          fixed top-0 z-50, h-16, out of flow
    {route-group layout}                owns pt-16 to clear the fixed header
```

### Per-route-group layouts

| Group | Wrapper |
|---|---|
| `(public)` | `<div className="flex min-h-screen flex-col pt-16"><main flex-1>{children}</main><Footer /></div>` |
| `(auth)` | `<div className="flex min-h-screen flex-col pt-16"><main flex flex-1 items-center justify-center>{children}</main><Footer /></div>` |
| `(dashboard)` | `<DashboardLayout>` — `<div className="flex pt-16"><Sidebar /><main flex-1>{children}</main></div>` |
| `(voice)` | `{children}` — full-bleed, no chrome |

### Header

`<Header>` is `position: fixed top-0 z-50 h-16` and out of normal flow. Each route-group layout adds `pt-16` to its wrapper so content starts below the header. Because the document scrolls and the header is fixed, the `backdrop-blur` glass effect just works — content scrolls behind it with no inner-scroll-container gymnastics.

### Dashboard sidebar

The sidebar uses **`position: sticky; top: 4rem`** with explicit height `calc(100vh - 4rem)`. It sits inside the dashboard's flex row alongside `<main>`; as the document scrolls, the sidebar sticks to the bottom edge of the fixed header. The sidebar's own `nav flex-1 + user-info` layout pins the user info to the bottom of the sidebar at all times.

This works because:
- The dashboard wrapper's height is the natural height of its tallest child (`<main>`), which can be much taller than the viewport.
- `position: sticky` keeps the sidebar visible within that wrapper as the document scrolls past it.
- The explicit `h-[calc(100vh-4rem)]` (and `self-start`) overrides the default flex `align-items: stretch` so the sidebar doesn't try to match `<main>`'s height.

### Anchor links and the fixed header

Use `scroll-mt-16` (or larger) on any element that's a hash-anchor target so it lands below the fixed header instead of behind it. `scroll-mt-20` (5rem) gives a small breathing-room offset that reads better than the exact header height. Examples: `src/components/home/about-section.tsx`, `src/app/(dashboard)/admin/ui-components/page.tsx`.

## History (why this doc exists)

The layout went through several iterations before landing here. Earlier versions tried to make the root `<main>` a fixed-height scroll container so dashboard pages could derive heights from it. Symptoms cascaded:

1. Dashboard content overflowed and pushed the sidebar off-screen → fixed by adding `overflow-auto` on an inner dashboard `<main>`.
2. A second document-level scrollbar appeared → "fixed" by adding `overflow-hidden` to `<html>`.
3. The home hero collapsed to zero height → fixed by removing `flex flex-col` from the root `<main>`.
4. `window.scrollY`, native hash navigation, Playwright `elementFromPoint`, and many third-party scroll libraries silently broke because the document didn't scroll. Each grew its own workaround.

The fix was to undo the inner-scroll-container architecture entirely: drop the root `<main>` wrapper, drop the dashboard's inner scroll container, and switch the sidebar to `position: sticky`. The document is now the single scroll container, and all the workarounds for scroll listeners, hash navigation, and Playwright clicks went away.

If you find yourself reaching for `h-screen overflow-auto` on a top-level container, stop — you'll re-introduce the cascade above. The right shape is `min-h-screen` plus `pt-16` on the wrapper, document scroll, and `position: sticky` for anything that should stay visible while scrolling.

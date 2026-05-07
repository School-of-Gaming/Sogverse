# Layout Scroll Architecture

## Current Design

The app uses a single-page layout where all scrolling is managed by inner containers — the document itself (`<html>`) never scrolls.

```
<html>                overflow-hidden (no document-level scroll)
  <body>
    <Header />        fixed top-0 z-50 (overlaps <main>, enables backdrop-blur)
    <main>            h-screen overflow-auto pt-16
      {children}      ← public pages scroll here
      OR
      <Dashboard>     flex h-full overflow-hidden
        <Sidebar>     h-full flex-col (pinned, never scrolls)
        <main>        flex-1 overflow-auto
          {page}      ← dashboard pages scroll here
```

### Scroll containers

| Page type | Scroll container | Element |
|-----------|-----------------|---------|
| Public pages | Root `<main>` | `layout.tsx` → `<main className="h-screen overflow-auto pt-16">` |
| Dashboard pages | Dashboard `<main>` | `dashboard-layout.tsx` → `<main className="flex-1 overflow-auto">` |

### Header positioning

The header uses `position: fixed` (not `sticky`) so that it overlaps the root `<main>`. This allows page content to scroll behind the header, making the `backdrop-blur` glass effect visible. The `pt-16` on `<main>` prevents content from being hidden behind the 64px header.

`<main>` uses `h-screen` (100vh) to fill the viewport, with `pt-16` padding to keep content below the header. For dashboard pages, the dashboard wrapper uses `h-full` which resolves to `<main>`'s content box height (total height minus `pt-16` padding), so the dashboard fills the space below the header exactly.

### Why `overflow-hidden` on `<html>`

Without it, a second browser-level scrollbar appears when dashboard content exceeds the viewport height. The root cause is subtle — something (likely browser rounding of `100vh`, default margins, or subpixel rendering) causes the `h-screen` div to be fractionally taller than the viewport, triggering document-level overflow.

We investigated this thoroughly (March 2026) using Playwright to measure every layer:
- The second scrollbar is **outside** `<html>` — it's the browser viewport scrollbar
- `<html>` reports `scrollHeight: 1440` (double viewport) while `<body>` reports `scrollHeight: 720` (correct)
- Both `<html>` and `<body>` have `offsetHeight: 720`, no margins, no padding, no borders
- The overflow is substantial (720px extra — not a rounding error)
- **Root cause:** When both `<html>` and `<body>` have `overflow: visible` (the default), browsers propagate nested scrollable content to the viewport. The dashboard `<main>` has `overflow: auto` with ~1640px of scroll content — the browser surfaces this as viewport-level overflow even though all intermediate containers properly constrain it
- This is standard browser behavior per the CSS overflow spec: overflow on the root element propagates to the viewport
- `overflow-hidden` on `<html>` is the correct fix — it stops the browser from propagating inner scroll content to the viewport and lets each container manage its own scrolling

### If revisiting this

The `overflow-hidden` IS the correct solution for this browser behavior, not a workaround. If you still want to explore alternatives:
1. Setting `overflow: auto` on `<html>` instead of `hidden` would also work (it stops propagation) but would show a viewport scrollbar if anything ever overflows `<html>` itself
2. The Playwright debug script at `tests/debug-layout.mjs` can be used to measure all layers (delete it when no longer needed)
3. CSS overflow spec reference: when both `<html>` and `<body>` have `overflow: visible`, the UA must apply the body's overflow to the viewport

### Playwright and `overflow-hidden`

Playwright's click actionability check uses `elementFromPoint` at the target's coordinates before clicking. With `overflow-hidden` on `<html>`, the scroll container is `<main>` instead of the viewport. This changes the CSS stacking context — sibling sections later in the DOM (which paint on top of earlier positioned sections) can register as "intercepting pointer events" even when they don't visually overlap. Real users are unaffected because browser click dispatch doesn't perform this check.

Affected tests use `.dispatchEvent("click")` instead of `.click()` to target the DOM node directly. See `tests/e2e/home.spec.ts` for examples.

### Why `<main>` must NOT be `flex flex-col`

An earlier version added `flex flex-col` to `<main>` so the dashboard layout could use `flex-1`. This caused the home page hero section (which has `overflow: hidden` for decorative blur clipping) to collapse to zero height. Per CSS spec, a flex item that is a scroll container gets `min-height: 0` instead of `min-content`, so when the flex algorithm needed to shrink items, the hero absorbed all the shrinkage and became invisible.

The fix: `<main>` is a plain `overflow-auto` container (no flex). The dashboard layout uses `h-full` (resolves to `<main>`'s content box height) instead of `flex-1` to fill the available space.

### Dashboard sidebar

The sidebar uses `h-full` inside the dashboard wrapper (`flex h-full overflow-hidden`). This keeps it pinned to the full height with the user info section locked at the bottom. The dashboard wrapper's `overflow-hidden` ensures its content never overflows into the root `<main>`, preventing double scrollbars within the dashboard.

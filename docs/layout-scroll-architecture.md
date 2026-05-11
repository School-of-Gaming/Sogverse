# Layout Scroll Architecture

## Current Design

The **document is the single scroll container** for every route group. There are no inner `overflow-auto` panes; the page scrolls naturally and `window.scrollY` reflects the user's actual scroll position.

```
<html>                                  default (overflow: visible)
  <body>
    {route-group layout}                renders its own <Header> in flow
      <Header />                        sticky top-0 z-50, h-16, in flow
      <main>{children}</main>
      <Footer /> (where applicable)
```

### Per-route-group layouts

| Group | Wrapper |
|---|---|
| `(public)` | `<div className="flex min-h-screen flex-col"><Header /><main flex-1>{children}</main><Footer /></div>` |
| `(auth)` | `<div className="flex min-h-screen flex-col"><Header /><main flex flex-1 items-center justify-center>{children}</main><Footer /></div>` |
| `(dashboard)` | `<><Header /><DashboardLayout>...</DashboardLayout></>` — `<div className="flex"><Sidebar /><main flex-1>{children}</main></div>` |
| `(voice)` | `{children}` — page renders `<InstantVoiceHeader />` then session UI; no app chrome |

### Header

`<Header>` (and `<InstantVoiceHeader>` for the `(voice)` group) is rendered through a shared `<SiteHeaderShell>` wrapper that owns the chrome: `position: sticky top-0 z-50`, height `var(--header-height)`, the bottom border, and the backdrop-blur strip. Because sticky elements participate in normal flow, the header reserves its own slot at the top of each layout — no wrapper needs a `pt-16` offset to clear it. When the user scrolls, the header sticks to the viewport top and content scrolls behind it, where the `backdrop-blur` glass effect produces the frosted look against whatever content passes underneath.

### Header height — `--header-height`

The header's height is owned by a single CSS variable in `src/app/globals.css`:

```css
--header-height: 4rem;
```

Everything that has to line up with the header reads from this variable instead of duplicating the number:

- `<SiteHeaderShell>` — `h-[var(--header-height)]`
- Dashboard sidebar — `top-[var(--header-height)]` and `h-[calc(100vh-var(--header-height))]`
- Hash-anchor targets — `scroll-mt-[var(--header-height)]` (or `scroll-mt-[calc(var(--header-height)+1rem)]` when you want a small breathing-room offset, e.g. `src/app/(dashboard)/admin/ui-components/page.tsx`)
- Home page hero's bleed-under-header trick — `-mt-[var(--header-height)] ... pt-[var(--header-height)]` on `src/app/(public)/page.tsx`

Change the variable and the whole layout follows. **Never hardcode `h-16` / `top-16` / `4rem` / `calc(100vh - 4rem)` for header-height purposes** — those have no relationship to the variable and silently drift if the header is ever resized.

### Dashboard sidebar

The sidebar uses **`position: sticky; top: var(--header-height)`** with explicit height `calc(100vh - var(--header-height))`. It sits inside the dashboard's flex row alongside `<main>`; as the document scrolls, the sidebar sticks just below the sticky header. The sidebar's own `nav flex-1 + user-info` layout pins the user info to the bottom of the sidebar at all times.

This works because:
- The dashboard wrapper's height is the natural height of its tallest child (`<main>`), which can be much taller than the viewport.
- `position: sticky` keeps the sidebar visible within that wrapper as the document scrolls past it.
- The explicit `h-[calc(100vh-4rem)]` (and `self-start`) overrides the default flex `align-items: stretch` so the sidebar doesn't try to match `<main>`'s height.

### Anchor links and the sticky header

Use `scroll-mt-[var(--header-height)]` on any element that's a hash-anchor target so it lands below the stuck header instead of behind it. For an offset that reads better than the exact header edge, `scroll-mt-[calc(var(--header-height)+1rem)]` gives a small breathing-room margin. Examples: `src/components/home/about-section.tsx`, `src/app/(dashboard)/admin/ui-components/page.tsx`.

## History (why this doc exists)

The layout went through several iterations before landing here. Earlier versions tried to make the root `<main>` a fixed-height scroll container so dashboard pages could derive heights from it. Symptoms cascaded:

1. Dashboard content overflowed and pushed the sidebar off-screen → fixed by adding `overflow-auto` on an inner dashboard `<main>`.
2. A second document-level scrollbar appeared → "fixed" by adding `overflow-hidden` to `<html>`.
3. The home hero collapsed to zero height → fixed by removing `flex flex-col` from the root `<main>`.
4. `window.scrollY`, native hash navigation, Playwright `elementFromPoint`, and many third-party scroll libraries silently broke because the document didn't scroll. Each grew its own workaround.

The fix was to undo the inner-scroll-container architecture entirely: drop the root `<main>` wrapper, drop the dashboard's inner scroll container, and switch the sidebar to `position: sticky`. The document is now the single scroll container, and all the workarounds for scroll listeners, hash navigation, and Playwright clicks went away.

If you find yourself reaching for `h-screen overflow-auto` on a top-level container, stop — you'll re-introduce the cascade above. The right shape is `min-h-screen` on the wrapper, the header rendered in flow via `<SiteHeaderShell>` (a `position: sticky top-0` element sized by `var(--header-height)`, so it reserves its own space without anyone hardcoding `pt-16`), document scroll, and `position: sticky` for anything else that should stay visible while scrolling.

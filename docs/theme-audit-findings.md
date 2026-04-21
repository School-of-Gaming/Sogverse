# Theme Audit — Soft Findings

Generated as part of the theme-consistency audit on PR #14 (`fix/accent-neutral-surface`).

The hard violations uncovered in the audit (raw white/black utilities, mismatched
foreground pairs, a straggler no-op hover) were fixed directly in the same commit
that added this document. The items below are **soft findings** — places where
the theme is bypassed but the reason is plausibly intentional, or where the fix
would change behavior and needs a human call. They are not fixed by the audit
commit.

Pick what you want from this list and file follow-ups. Nothing here blocks PR #14.

---

## Category 6 — Missing foreground pairs

### `src/components/layout/sidebar.tsx:96`
```tsx
className="... bg-sidebar-background text-sidebar-foreground shadow-sm hover:bg-sidebar-accent md:flex"
```
The sidebar collapse toggle sets `hover:bg-sidebar-accent` without the matching
`hover:text-sidebar-accent-foreground`. The text color stays
`text-sidebar-foreground` on hover. In practice `sidebar-foreground` and
`sidebar-accent-foreground` are the same HSL today, so there's no visible
regression — but if either token is ever re-tuned the pair will drift.
**Assessment:** minor, purely-defensive fix. Add `hover:text-sidebar-accent-foreground`.

### `src/components/voice/SpatialVoiceRoom.tsx:91`
```tsx
<Badge className="bg-success/10 text-success">
```
Not a missing-foreground-pair violation — `bg-success/10` is a tinted wash over
the current surface, not a solid success background — so `text-success`
(accent-on-wash) is the right pair here. Listed only so reviewers don't flag it
as a false positive; no action needed.

### `src/components/voice/ScreenShareDisplay.tsx:57`
```tsx
<div className="relative overflow-hidden rounded-lg border bg-black">
```
Pure `bg-black` as video letterbox background. No text lives directly on this
surface (the video fills it), so there's no foreground pair to set. Video
letterbox is a hard convention — players almost universally use pure black so
dark video content bleeds seamlessly into the frame. `bg-background` would
break this in light theme.
**Assessment:** leave as-is; consider promoting to a documented
`bg-video-letterbox` token if we ever theme media players.

---

## Category 7 — Inline `style={{ ... }}` with literal colors

### `src/app/(public)/about/page.tsx:167–206` — Klingon easter egg
```tsx
style={{ borderColor: 'rgba(221,0,0,0.4)', backgroundColor: '#0a0a0a' }}
style={{ color: '#d00' }}
// ...and more throughout the Klingon block
```
Ships behind `locale === "tlh"`. The file already has an inline comment
explaining that these are Klingon Empire flag colours, not brand/theme colours,
and are intentionally hard-coded for the easter egg.
**Assessment:** intentional. Leave.

### `src/app/opengraph-image.tsx`
All `style={{ color: ... }}` uses reference `BRAND`, `DARK_THEME`, and
`YTY_ELEMENT` constants from `src/lib/constants/colors.ts`, which the audit
scope explicitly documents as the escape hatch for non-CSS contexts (OG image
rendered via `@vercel/og` — no Tailwind classes).
**Assessment:** intentional. Leave.

### `src/lib/email-templates/**`
Every email template constructs HTML strings with inline `style="..."` using
`BRAND` / `DARK_THEME` / `STATUS` from `src/lib/constants/colors.ts`. Email
HTML requires inline styles — most clients strip `<style>` blocks and ignore
class attributes.
**Assessment:** intentional, called out in `CLAUDE.md` scope as an exception. Leave.

### `src/lib/constants/spatial.config.ts:31–47` — speaking glow
```ts
export const SPEAKING_GLOW = {
  color: "255, 255, 255",
  maxSpread: 14,
  threshold: 0.05,
};
// computeGlowStyle() returns { boxShadow: `0 0 ${spread}px rgba(${color}, ${opacity})`, ... }
```
Hard-coded white RGB used in a runtime-computed `boxShadow` for the voice
avatar speaking animation. Not themeable via CSS variables because the opacity
is dynamic (audio-level driven). Could be `var(--foreground)` unpacked to RGB,
but the effect is intentionally "the avatar emits light" — white is the usual
choice regardless of theme.
**Assessment:** intentional; consider filing an enhancement if we want the
glow to follow the theme.

### `src/components/ui/identicon.tsx:10`
```ts
const BACKGROUND = "#000000";
```
SVG `<rect fill="#000000">` for identicon background. Canvas/SVG fill — listed
as a legitimate exception in audit scope. Could be `var(--background)` via
`fill="currentColor"` + wrapping element color, but identicons are designed
against a pure black plate for contrast with the colored cells.
**Assessment:** intentional. Leave.

### `src/lib/identicon.ts:3`
```ts
const COLORS = [BRAND.primary, BRAND.secondary, "#FFFFFF"];
```
Pure white added to the identicon palette alongside the two brand hexes.
Runtime-generated SVG — semantic tokens don't apply.
**Assessment:** intentional. Leave.

### `src/app/icon.svg:3`
```xml
<g fill="#FAA901" ...>
```
Favicon SVG hard-codes brand yellow. Favicons don't participate in app theme.
**Assessment:** intentional. Leave.

---

## Category 8 — Raw hex / rgb / hsl in `.css` files outside `globals.css`

None. `src/**/*.css` contains only `src/app/globals.css`.

---

## Category 9 — Opacity-modified backgrounds used as hovers

### `src/components/ui/dialog.tsx:28` and `src/components/ui/sheet.tsx:43`
```tsx
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm" ... />
```
Modal/sheet scrim. This is the standard shadcn pattern (`bg-black/50` or
`bg-black/80`) — the intent is "darken everything behind the modal." Using a
semantic token would invert in light theme, which is *not* the standard modal
convention (scrims stay dark regardless of theme in most systems).
**Assessment:** standard convention; audit scope calls out not modifying shadcn
primitives unless it's clearly a mistake. Leave.

### `src/components/ui/button.tsx:11,13,15,17,18` — shadcn button variants
```tsx
// default: hover:bg-primary/90
// destructive: hover:bg-destructive/90
// outline: hover:bg-accent hover:text-accent-foreground
// secondary: hover:bg-secondary/80
// ghost: hover:bg-accent hover:text-accent-foreground
```
Upstream shadcn button variants. `primary/90`, `destructive/90`, `secondary/80`
are the canonical "solid button darkens on hover" idiom for this library.
**Assessment:** shadcn primitive, do not modify. Leave.

### `src/components/customer/SwitchToGamerDialog.tsx:89`
```tsx
<Button className="bg-info text-info-foreground hover:bg-info/90" ...>
```
Custom override to render a button in the `info` color scheme, mirroring the
shadcn primary button pattern (`bg-x text-x-foreground hover:bg-x/90`). Clean
and idiomatic — flagged only because it's not a shadcn variant.
**Assessment:** intentional, consistent with primitive. Consider promoting to
a Button `variant="info"` if we add more info-coloured buttons.

### `src/app/page.tsx:68,88` — wash surfaces
```tsx
<Card className="bg-card/50">
<section className="bg-muted/30 py-24">
```
Transparent overlays over the main background for visual rhythm on the landing
page. Not hovers — decorative surfaces. Noted for visibility.
**Assessment:** intentional. Leave.

### `src/components/voice/ParticipantRow.tsx:49`
```tsx
p.isLocal && "bg-accent/50",
```
`/50` used to dim the persistent "you" highlight so it doesn't compete with
the hover state (which is full `bg-accent`). Considered but kept — the
two-level stack (always-on /50, hover full) is working as designed.
**Assessment:** intentional. Leave.

### `src/components/layout/currency-picker.tsx:28` and `locale-picker.tsx:75`
```tsx
className="... bg-muted/50 px-2 py-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
```
Default state is `bg-muted/50` (soft surface); hover flips to the standard
accent pair. This is the new idiom after PR #14's sweep — default surface is
`muted/50`, hover is the accent pair — and it reads correctly.
**Assessment:** intentional, consistent with the PR #14 pattern. Leave.

---

## Category 10 — Odd semantic mismatches

### `src/components/voice/VoiceAvatar.tsx:60`
```tsx
isLocal ? "text-primary" : "text-foreground"
```
Uses `text-primary` (brand yellow) to mean "this is you." Primary-as-identity
is common, but primary is also our "call to action" colour, so yellow here
might be read as "actionable." Consider whether a dedicated `--self` token
would be cleaner if we ever use more self-indicators.
**Assessment:** minor. Leave.

### `src/app/(dashboard)/admin/whatsapp/page.tsx:118,188` — avatar chip
```tsx
<div className="... bg-primary/20 text-sm font-medium text-primary">
```
`bg-primary/20` + `text-primary` for a contact avatar placeholder. Uses brand
yellow aggressively for a neutral avatar role; a `bg-muted text-muted-foreground`
would probably read more "initial placeholder." This is a style call, not a
bug.
**Assessment:** style choice. Leave.

### `src/components/auth/login-form.tsx:37`
```ts
accent: "text-primary border-primary/30 bg-primary/5",
```
Named `accent` here but actually the brand/primary scheme. After PR #14,
`accent` is the neutral hover surface; this local variable name predates that
rename and is slightly misleading. Consider renaming to `brand` or `primary`
in a follow-up — no visual impact.
**Assessment:** stale naming. Leave, file separately if desired.

---

## Summary

- No category 1–5 (hard-fix) violations remain after the audit commit.
- The soft findings above are either documented exceptions, shadcn primitives
  we deliberately do not touch, runtime SVG/canvas fills, or style judgments
  that need a design call.
- The codebase is in very good shape token-wise. PR #14's sweep was thorough.

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

### ~~`src/components/layout/sidebar.tsx:96`~~ (fixed)

Added `hover:text-sidebar-accent-foreground` to the sidebar collapse toggle's
hover so the foreground pair can follow `--sidebar-accent` if it's ever re-tuned.

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

**Reviewer pushback (2026-04-21):** the "working as designed" reasoning held
when `--accent` was brand yellow — `bg-accent/50` over a 10%-card was a very
visible yellow wash marking "you." Under the new neutral accent,
`bg-accent/50` over a 10%-card computes to ~11.5% — a 1.5-point lift over
the surrounding card surface, essentially invisible. The persistent self-cue
is gone unless the row is being hovered. The `(you)` text label survives, so
functionally the user isn't lost, but the strong visual anchor is. If the
intent is "subtle persistent self-highlight," `bg-primary/10` or a
`border-primary` treatment retains the affordance and survives the token
retune. Worth a design call rather than a flat "leave" — flagged here, not
fixed.

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

### ~~`src/components/auth/login-form.tsx:37`~~ (fixed)

Local field on `ROLE_CONFIG` was named `accent` but held the brand/primary
scheme. Renamed to `brand` to match what it actually describes and to avoid
confusion with the `--accent` token, which is now a neutral hover surface.

---

## Category 11 — `hover:border-primary` stragglers (code-pattern hazard, not a visible bug today)

PR #14 codified the rule "phase out brand primary on hover" but the sweep focused on background surfaces. Grep-level search afterward surfaced three real-app files still using `hover:border-primary` / `/50` / `/60`:

- `src/components/enrollment/enrollment-wizard.tsx:470` — `GroupCard` (shown at the "Choose a group" step). `border border-border ... hover:border-primary hover:bg-accent`.
- `src/components/enrollment/inline-gamer-form.tsx:250` — inactive gamer tile inside the add-a-gamer form. `border-border hover:border-primary/50`.
- `src/components/auth/login-form.tsx:38` — role-selection card glow on `/login`. `hover:border-primary/60`.

**Why this is *not* a visible bug today:** each is paired with a neutral baseline border (`border-border`), so the hover shift to primary-yellow on a 1px border is visually absorbed into the grey hover surface next to it. Browser-tested — `GroupCard` renders as a neutral grey hover, no yellow flash.

**Why it still deserves a code-level fix:** the pattern is copy-paste bait. Our mock CTAs used the same class pattern combined with a *tinted* baseline border (`border-primary/40`), and the hover activated into a very visible yellow flash — the exact problem PR #14 was trying to eliminate. Anyone who copies this pattern into a context with even a slightly tinted baseline reintroduces the bug. And if the baseline on one of these three files is ever tweaked to include a primary tint, the pattern activates in place.

**Fix when next touching these files:** replace `hover:border-primary/*` with the surface-only shadcn idiom `hover:bg-accent hover:text-accent-foreground` (no border shift). For the login-form glow, keep the shadow-glow but drop the border-color change.

**Assessment:** code hygiene follow-up, low-priority.

---

## Category 12 — Non-hover uses of `bg-accent` after the token retune

PR #14 changed `--accent` from brand yellow to a neutral hover surface. Most of
the codebase's `bg-accent` uses are on `hover:`, which reads correctly under
the new token. A couple of places use `bg-accent` (or interact with it via
`bg-muted`) as a *persistent* state — active nav, selected row — and those
now produce weak or backwards affordances. Surfaced during review of PR #14
after merge; not caught by the original sweep because the sweep focused on
hover-surface migrations, not on pre-existing persistent `bg-accent` usage.

### `src/components/layout/header.tsx:211` — mobile nav active state collapses into hover

```tsx
className={cn(
  "block rounded-md px-3 py-2 text-sm font-medium",
  pathname === link.href
    ? "bg-accent text-accent-foreground"
    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
)}
```

Before PR #14: active = yellow, hover = yellow — already ambiguous but loud.
After PR #14: active = neutral (13% dark / 96% light), hover = same token. A
user opening the mobile menu cannot tell which page they're on without hovering
alternatives for comparison, and even then the contrast between "active" and
"hover" is zero. The desktop nav uses a different pattern (`text-primary`
underline) and is unaffected — this is mobile-only.

**Fix:** give the active state a distinct token. `bg-primary/10 text-primary`
keeps brand identity; `bg-muted text-foreground` is the quieter shadcn-convention
option. Hover stays on `bg-accent`.

**Assessment:** real regression. Fix when next touching `header.tsx`.

### `src/app/(dashboard)/admin/whatsapp/page.tsx:113-116` — hovering a selected contact darkens it

```tsx
className={cn(
  "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
  selectedPhone === contact.phone && "bg-muted"
)}
```

Selected row = `bg-muted` (15%). Hover = `bg-accent` (13%). `:hover` specificity
beats unprefixed `bg-muted`, so hovering an already-selected contact drops it
from 15% → 13% — a *darker* state than when not hovered. Intuitively backwards:
hover should reinforce (or at minimum preserve) the selection cue, not weaken
it. The text-foreground flip (`hover:text-accent-foreground`) also applies to
the selected row, so the selection-plus-hover state visually reads "deselected
on hover."

Secondary issue: 15% vs 13% is a 2-point gap in dark mode. The selected row
is barely distinguishable from unselected rows when nothing is being hovered.

**Fix:** either bump the selected state to something clearly stronger
(`bg-primary/10 border-l-2 border-primary`), or at minimum prevent hover from
overriding selection:

```tsx
selectedPhone === contact.phone
  ? "bg-primary/10 text-foreground"
  : "hover:bg-accent hover:text-accent-foreground"
```

**Assessment:** real interaction bug. Low-traffic admin page so not urgent,
but fix when next touching `whatsapp/page.tsx`.

---

## Summary

- No category 1–5 (hard-fix) violations remain after the audit commit.
- The soft findings above are either documented exceptions, shadcn primitives
  we deliberately do not touch, runtime SVG/canvas fills, or style judgments
  that need a design call.
- Category 11 is a code-pattern hazard surfaced after PR #14: the token cascade is correct, but three files still carry a `hover:border-primary` class that could reactivate the yellow-on-hover bug if their baseline is ever re-tinted.
- Category 12 is two concrete regressions that PR #14's sweep missed: persistent `bg-accent` uses (mobile nav active state) and `bg-muted`/`bg-accent` selection+hover interactions that are now backwards under the neutral accent token. Neither is urgent but both are real. The ParticipantRow entry in Category 9 has an attached pushback on the same theme — the "/50 over card" math makes the persistent self-highlight near-invisible under the new accent.
- The codebase is in very good shape token-wise. PR #14's sweep was thorough.

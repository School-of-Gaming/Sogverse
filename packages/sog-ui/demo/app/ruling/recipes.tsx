/**
 * Sogverse's own constructs, reproduced from the real components.
 *
 * A swatch labelled `popover-foreground` tells nobody anything. These are the
 * things the tokens actually draw — a menu, a field, a card, a row, a status
 * pill — copied class-for-class from the components that draw them, so a
 * ruling is made against the thing rather than against its name. Each one takes
 * a `Palette`, which is what makes a rename provable by eye: the same construct
 * rendered twice, once naming today's token and once naming the token proposed
 * to replace it, and the two pictures are identical because the two values are.
 *
 * **Layout classes are the real ones; colour arrives as an inline style.** The
 * demo's stylesheet is the library's theme, which has no `bg-popover` and no
 * `bg-destructive` to compile — and Tailwind scans source text, so a class
 * assembled at render time is a class that does not exist. So the geometry,
 * spacing, radius and type of each recipe is verbatim, and only the colour
 * moves to `style`.
 *
 * Where a construct has a state a static page cannot show — a hover, a focus
 * ring — the state is drawn as its own labelled copy rather than left to a
 * pointer that may never arrive.
 */

import { Glyph } from "./parts";

/**
 * Every colour token a construct below can spend.
 *
 * Flat and complete on purpose: a recipe names the token it wants, so swapping
 * a whole palette is one argument and no recipe knows which question is being
 * asked of it.
 */
export interface Palette {
  readonly background: string;
  readonly foreground: string;
  readonly card: string;
  readonly cardForeground: string;
  readonly popover: string;
  readonly popoverForeground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly accent: string;
  readonly accentForeground: string;
  readonly border: string;
  readonly input: string;
  readonly ring: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly secondary: string;
  readonly secondaryForeground: string;
  readonly destructive: string;
  readonly destructiveForeground: string;
  readonly success: string;
  readonly successForeground: string;
  readonly warning: string;
  readonly warningForeground: string;
  readonly info: string;
  readonly infoForeground: string;
}

/** Sogverse's theme as the browser paints it today, converted from the HSL triples. */
export const TODAY: Palette = {
  background: "#121212",
  foreground: "#EDEDED",
  card: "#1A1A1A",
  cardForeground: "#EDEDED",
  popover: "#1A1A1A",
  popoverForeground: "#EDEDED",
  muted: "#262626",
  mutedForeground: "#A6A6A6",
  accent: "#212121",
  accentForeground: "#EDEDED",
  border: "#333333",
  input: "#333333",
  ring: "#FAA901",
  primary: "#FAA901",
  primaryForeground: "#121212",
  secondary: "#8F00E2",
  secondaryForeground: "#FFFFFF",
  destructive: "#EF4343",
  destructiveForeground: "#FFFFFF",
  success: "#2EB88A",
  successForeground: "#FFFFFF",
  warning: "#E7B008",
  warningForeground: "#121212",
  info: "#308CE8",
  infoForeground: "#FFFFFF",
};

/**
 * The same palette after the renames, and after nothing else.
 *
 * `popover` becomes the card, `input` becomes the border, `ring` becomes the
 * primary, and the four `-foreground` duplicates become the foreground. Every
 * substituted value is byte-identical to the one it replaces, which is the
 * claim the paired renderings are there to let the eye check.
 */
export const RENAMED: Palette = {
  ...TODAY,
  popover: TODAY.card,
  popoverForeground: TODAY.foreground,
  cardForeground: TODAY.foreground,
  accentForeground: TODAY.foreground,
  input: TODAY.border,
  ring: TODAY.primary,
};

// ------------------------------------------------------------------- card

/**
 * `ui/card.tsx` — the surface nearly every dashboard section is built from.
 * Spends `card`, `card-foreground`, `border` and, through `CardDescription`,
 * `muted-foreground`.
 */
export function AppCard({ palette }: { palette: Palette }) {
  return (
    <div
      className="rounded-lg border shadow-sm"
      style={{
        backgroundColor: palette.card,
        color: palette.cardForeground,
        borderColor: palette.border,
      }}
    >
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-2xl leading-none font-semibold tracking-tight">
          Tuesday club
        </h3>
        <p className="text-sm" style={{ color: palette.mutedForeground }}>
          Kirkkonummi · Mondays and Wednesdays · 12 of 14 seats
        </p>
      </div>
      <div className="p-6 pt-0">
        <p className="text-sm">Next session Wednesday, 17:00</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ field

/**
 * `ui/input.tsx` with `ui/label.tsx` — the login form, and every admin search
 * box. Spends `input` for the edge, `background` for the fill, `ring` on focus
 * and `muted-foreground` for the placeholder.
 */
export function AppField({
  palette,
  focused,
  empty,
}: {
  palette: Palette;
  focused: boolean;
  empty: boolean;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-sm leading-none font-medium">Email</span>
      <span
        className="flex h-10 w-full items-center rounded-md border px-3 py-2 text-base"
        style={{
          backgroundColor: palette.background,
          borderColor: palette.input,
          color: empty ? palette.mutedForeground : palette.foreground,
          boxShadow: focused
            ? `0 0 0 2px ${palette.background}, 0 0 0 4px ${palette.ring}`
            : undefined,
        }}
      >
        {empty ? "you@example.com" : "aino.virtanen@example.com"}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------- menu

/**
 * `ui/filter-dropdown.tsx` — the open listbox on the admin club-product
 * filters, and the same recipe as the chat message menu in
 * `chat/ChatMessageActions.tsx`. Spends `popover` and `popover-foreground` for
 * the panel, `input` for its edge, and `accent`/`accent-foreground` for the
 * option under the pointer.
 */
export function AppMenu({ palette }: { palette: Palette }) {
  return (
    <div className="w-full max-w-xs">
      <span
        className="flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm"
        style={{
          backgroundColor: palette.background,
          borderColor: palette.input,
          color: palette.foreground,
        }}
      >
        Espoo
        <Glyph name="chevron" size={16} colour={palette.mutedForeground} />
      </span>
      <div
        className="mt-1 max-h-64 overflow-y-auto rounded-md border p-1 shadow-md"
        style={{
          backgroundColor: palette.popover,
          color: palette.popoverForeground,
          borderColor: palette.input,
        }}
      >
        <span
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
          style={{ backgroundColor: palette.accent, color: palette.accentForeground }}
        >
          <span className="min-w-0 flex-1 truncate">Espoo</span>
          <Glyph name="checkMark" size={16} colour={palette.primary} />
        </span>
        <span className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm">
          <span className="min-w-0 flex-1 truncate">Helsinki</span>
        </span>
        <span
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
          style={{ backgroundColor: palette.accent, color: palette.accentForeground }}
        >
          <span className="min-w-0 flex-1 truncate">Kirkkonummi</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- buttons

/** `ui/button.tsx` — every variant, on the ground each one really sits on. */
export function AppButtons({ palette }: { palette: Palette }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow"
        style={{ backgroundColor: palette.primary, color: palette.primaryForeground }}
      >
        Buy a seat
      </span>
      <span
        className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm"
        style={{
          backgroundColor: palette.secondary,
          color: palette.secondaryForeground,
        }}
      >
        Explore Sogverse
      </span>
      <span
        className="inline-flex h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm"
        style={{
          backgroundColor: palette.background,
          borderColor: palette.input,
          color: palette.foreground,
        }}
      >
        Cancel
      </span>
      <span
        className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium"
        style={{ backgroundColor: palette.accent, color: palette.accentForeground }}
      >
        Ghost, hovered
      </span>
      <span
        className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm"
        style={{
          backgroundColor: palette.destructive,
          color: palette.destructiveForeground,
        }}
      >
        Remove seat
      </span>
    </div>
  );
}

// -------------------------------------------------------------------- row

/**
 * `admin/users/[id]/page.tsx` — an assigned-product row on a user's detail
 * page. One row spends `border`, `accent`/`accent-foreground` on hover, and a
 * status badge in `success`, `warning`, `muted` or `secondary` with its own
 * foreground; the warning row additionally carries a coloured edge and a 5%
 * wash of the same hue.
 */
export function AppRow({
  palette,
  state,
}: {
  palette: Palette;
  state: "rest" | "hover" | "warning";
}) {
  const badge =
    state === "warning"
      ? { fill: palette.warning, ink: palette.warningForeground, label: "Waitlisted" }
      : { fill: palette.success, ink: palette.successForeground, label: "Active" };
  return (
    <span
      className="flex items-center justify-between rounded-lg border p-3"
      style={{
        borderColor: state === "warning" ? palette.warning : palette.border,
        backgroundColor:
          state === "hover"
            ? palette.accent
            : state === "warning"
              ? palette.card
              : undefined,
        color: state === "hover" ? palette.accentForeground : undefined,
      }}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">
          Minecraft club — Espoo
        </span>
        {state === "warning" ? (
          <span
            className="flex items-center gap-1 truncate text-xs font-medium"
            style={{ color: palette.warning }}
          >
            <Glyph name="alert" size={14} colour={palette.warning} />
            Needs a group
          </span>
        ) : (
          <span className="block truncate text-xs" style={{ color: palette.mutedForeground }}>
            Wednesdays, 17:00
          </span>
        )}
      </span>
      <span
        className="ml-3 inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
        style={{
          backgroundColor: badge.fill,
          color: badge.ink,
          borderColor: badge.fill,
        }}
      >
        {badge.label}
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ pills

/**
 * `admin/users/page.tsx` — the role filter strip. The selected pill takes
 * `info` with its foreground; every unselected one takes `muted` with
 * `muted-foreground`.
 */
export function AppPills({ palette }: { palette: Palette }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm" style={{ color: palette.mutedForeground }}>
        Role:
      </span>
      <span
        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
        style={{ backgroundColor: palette.info, color: palette.infoForeground }}
      >
        All
      </span>
      {["Parents", "Gamers", "Gedus", "Admins"].map((role) => (
        <span
          key={role}
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: palette.muted, color: palette.mutedForeground }}
        >
          {role}
        </span>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- skeleton

/**
 * `admin/users/page.tsx` — the loading rows. The only place `muted` is spent as
 * a solid fill on its own rather than as a hover or a pill, and so the clearest
 * look at the value.
 */
export function AppSkeleton({ palette }: { palette: Palette }) {
  return (
    <div className="space-y-4">
      {[0, 1].map((row) => (
        <div
          key={row}
          className="flex items-center gap-4 rounded-lg border p-4"
          style={{ borderColor: palette.border }}
        >
          <span
            className="h-10 w-10 shrink-0 rounded-md"
            style={{ backgroundColor: palette.muted }}
          />
          <span className="flex-1 space-y-2">
            <span
              className="block h-4 w-32 rounded"
              style={{ backgroundColor: palette.muted }}
            />
            <span
              className="block h-3 w-48 rounded"
              style={{ backgroundColor: palette.muted }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- sidebar

const NAV = ["Dashboard", "Products", "Groups", "Users", "Settings"];

/**
 * `layout/sidebar.tsx` — the dashboard rail, on every admin and gedu page.
 * Spends all seven `sidebar-*` tokens: the ground, the edge, the ink, the
 * active item in the brand pair, and the hovered item on `sidebar-accent`.
 */
export function AppSidebar({
  palette,
  ground,
}: {
  palette: Palette;
  ground: string;
}) {
  return (
    <div
      className="flex h-64 overflow-hidden rounded-lg border"
      style={{ borderColor: palette.border, backgroundColor: palette.background }}
    >
      <div
        className="flex w-40 shrink-0 flex-col border-r"
        style={{ borderColor: palette.border, backgroundColor: ground }}
      >
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item, index) => (
            <span
              key={item}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              style={
                index === 0
                  ? { backgroundColor: palette.primary, color: palette.primaryForeground }
                  : index === 2
                    ? { backgroundColor: palette.muted, color: palette.foreground }
                    : { color: palette.foreground }
              }
            >
              <Glyph
                name="gamepad"
                size={14}
                colour={index === 0 ? palette.primaryForeground : palette.mutedForeground}
              />
              {item}
            </span>
          ))}
        </nav>
        <div className="border-t p-3" style={{ borderColor: palette.border }}>
          <p className="text-sm font-medium">Aino Virtanen</p>
          <p className="text-sm" style={{ color: palette.mutedForeground }}>
            Admin
          </p>
        </div>
      </div>
      <div className="flex-1 p-4">
        <p className="text-lg font-semibold">Products</p>
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: palette.border, backgroundColor: palette.card }}
        >
          <p className="text-sm">A card on the page, for the rail to be judged against.</p>
        </div>
      </div>
    </div>
  );
}

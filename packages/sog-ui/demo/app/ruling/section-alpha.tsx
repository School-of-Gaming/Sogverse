/**
 * Question 8 — colour at an alpha step.
 *
 * The surface is every utility carrying a `/n` modifier: 270 sites in 120
 * files, regenerated with
 *
 *     grep -rhoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline|fill|stroke)-[a-z-]+/[0-9]+" src --include=*.tsx --include=*.ts | sed -E 's/^([a-z]+)-(.*)\/([0-9]+)$/\2/' | sort | uniq -c | sort -rn
 *
 * which today reports act 52, muted 44, destructive 37, muted-foreground 18,
 * warning 16, info 16, success 12, background 12, white 8, world 5, card 5,
 * accent 5, the four Yty strong 4 each, foreground 3, black 3, act-foreground
 * 2, and sixteen zone hues at 1 each. `ALPHA_SITES` in `inventory.ts` carries
 * the classification of that list; this file draws the four shapes it splits
 * into.
 *
 * **The distinction the section exists to make visible.** An alpha step does
 * one of two entirely different jobs depending on what is underneath it.
 *
 * Over a ground the system did not choose — a photograph, a video frame, the
 * page scrolling under a floating control — there is no `on:` pairing to
 * measure, because the ground is different in every pixel and different again
 * tomorrow. Blending at render time is the only mechanism that works at all.
 * That is a scrim, and rows one to three draw it: fifteen sites, all of them
 * `bg-black/50`, `bg-black/60` or `bg-background/70`–`/90`.
 *
 * Over a ground the system *did* choose — the page, a card — the blend always
 * yields the same fixed colour. Rows four's triples draw that colour three
 * ways: the alpha step as the app paints it, the same value pre-mixed with
 * `composite()` as one opaque hex, and the plain token the palette actually
 * offers. The first two are the same colour, which is the whole demonstration:
 * the alpha step is a token that was never named, spelled as arithmetic, with
 * no pairing measured against it and no entry in the palette.
 *
 * **Why the first two columns land on the same pixels.** Tailwind's `/n`
 * compiles to `color-mix(in oklab, <colour> n%, transparent)`. Mixing anything
 * with `transparent` is done on premultiplied alpha, so the transparent half
 * contributes no colour and the result is simply the colour at alpha n/100 —
 * whatever space the mix is nominally performed in. The browser then composites
 * that over the opaque ground in sRGB, which is exactly the arithmetic
 * `composite()` does. So the identity is not a coincidence of these particular
 * values and does not need to be asserted; it is drawn.
 *
 * **What is drawn with a class and what with an inline style.** The page's
 * standing rule: a library token is drawn with the class the app writes, and
 * anything else is drawn inline, because Tailwind scans source text. So
 * `bg-card/50`, `bg-act/10` and `text-muted-foreground/50` are the real classes
 * — the app's own rendering, not this file's arithmetic — while black and the
 * status reds go through `alpha()` and `tailwindAlpha()`.
 *
 * **The images.** Two files copied from Sogverse's `public/preview-art/` into
 * the demo's own `public/ruling-art/`, because the demo is a separate Next app
 * with a separate static root and cannot reach the consumer's. They are deleted
 * with this directory. Each scrim and chip sits over a region carrying both the
 * dark violet corner and the bright salmon-and-gold corner, so the alpha is
 * seen doing its work at both ends rather than over one convenient midtone.
 *
 * **The one exemplar whose ground is honest only by proxy.** A profile tile
 * carries an identicon, which is drawn from tokens and so *is* a known ground;
 * the photograph stands in for it here. It is kept because the construct — a
 * control laid over a picture the layout cannot predict — is the one being
 * ruled on, and because a tile can carry a photo the moment avatars do.
 */

import Image from "next/image";
import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import { composite } from "../../../src/tokens/composite";
import { alpha, tailwindAlpha } from "./colour";
import {
  CARD,
  Case,
  Compare,
  EDGE,
  Exemplar,
  GROUND,
  Glyph,
  INK,
  MUTED_INK,
  Panel,
  Question,
} from "./parts";

const BLACK = "#000000";

/** Sogverse's `destructive`, which is question 2's and is not a library token. */
const DESTRUCTIVE = "#EF4343";

/** The two art files, at their public paths in the demo's own static root. */
const ARENA = "/ruling-art/session-arena.jpg";
const BADGE = "/ruling-art/session-badge.jpg";

/**
 * The four counterfeit colours, computed rather than typed.
 *
 * Each is the exact value the browser paints for the alpha step beside it, and
 * none of the four is in the palette, has a name, or has ever had a pairing
 * measured against it. They are rendered only as the middle column's label,
 * which is a name for the colour above it.
 */
const CARD_ON_GROUND = composite(NEUTRALS.card.hex, 0.5, NEUTRALS.background.hex);
const ACT_ON_CARD = composite(BRAND.act.hex, 0.1, NEUTRALS.card.hex);
const DESTRUCTIVE_ON_CARD = composite(DESTRUCTIVE, 0.1, NEUTRALS.card.hex);
const MUTED_INK_ON_CARD = composite(
  NEUTRALS.mutedForeground.hex,
  0.5,
  NEUTRALS.card.hex,
);

/**
 * A picture, filling whatever box it is given.
 *
 * `fill` rather than intrinsic dimensions because every construct below wants
 * the picture cropped to the shape of the real thing — a 16:9 video frame, a
 * square avatar tile, a strip thumbnail — and the crop is what puts a bright
 * region and a dark one under the same overlay.
 */
function Media({
  art,
  frame,
  children,
}: {
  art: string;
  frame: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${frame}`}>
      <Image
        src={art}
        alt=""
        fill
        sizes="(min-width: 1024px) 30vw, 100vw"
        className="object-cover"
      />
      {children}
    </div>
  );
}

// ------------------------------------------------------- over media: scrims

/**
 * `ui/dialog.tsx` and `ui/sheet.tsx` — `bg-black/50`, with the dialog's own
 * `backdrop-blur-sm`. The sheet takes the same fill without the blur.
 */
function DialogScrim() {
  return (
    <Media art={ARENA} frame="h-56 w-full rounded-lg">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: alpha(BLACK, 0.5) }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-xs rounded-lg border p-4 shadow-lg"
          style={{ backgroundColor: CARD, borderColor: EDGE }}
        >
          <p className="text-sm font-semibold" style={{ color: INK }}>
            Remove this photo?
          </p>
          <p className="mt-1 text-xs" style={{ color: MUTED_INK }}>
            It leaves Tuesday&rsquo;s session report.
          </p>
        </div>
      </div>
    </Media>
  );
}

/**
 * `family/ProfileTiles.tsx` — the tile mid-switch: `bg-black/60` over the
 * avatar, carrying the spinner. The tile's own `border-2 border-border` and
 * `ring-4 ring-act` are drawn too, because the scrim is judged inside the frame
 * it fills rather than as a rectangle.
 */
function TileScrim() {
  return (
    <div className="flex h-56 items-center justify-center">
      <div className="w-32">
        <Media
          art={BADGE}
          frame="aspect-square w-full rounded-lg border-2 border-border ring-4 ring-act ring-offset-2 ring-offset-background"
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: alpha(BLACK, 0.6) }}
          >
            <Glyph name="loader" size={32} colour="#FFFFFF" />
          </div>
        </Media>
      </div>
    </div>
  );
}

/**
 * `ui/fullscreen-image-viewer.tsx` — `bg-background/80` filling the whole
 * viewer, so a 16:9 picture on a tall screen sits in darkness rather than in a
 * bright band of dashboard.
 *
 * Drawn over the page it really covers, and over the dialog scrim it really
 * sits on: the viewer is a `Dialog`, so `bg-black/50` is underneath it. Two
 * alpha steps stacked over unknown ground is the honest picture of this one.
 */
function ViewerScrim() {
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-border bg-background p-3">
      <div className="space-y-2">
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="text-xs font-semibold">Tuesday club — Espoo</p>
          <p className="text-xs text-muted-foreground">Session report</p>
        </div>
        <span className="inline-flex h-8 items-center rounded-md bg-act px-3 text-xs font-semibold text-act-foreground">
          Buy a seat
        </span>
      </div>
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: alpha(BLACK, 0.5) }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4">
        <Media art={ARENA} frame="h-32 w-56 rounded-lg" />
      </div>
    </div>
  );
}

// -------------------------------------------------------- over media: chips

/** `gedu/session-feed/SessionPhotoStrip.tsx` — the strip thumbnail's remove control. */
function PhotoStripChip({ solid }: { solid: boolean }) {
  return (
    <Media art={BADGE} frame="h-20 w-28 rounded">
      <span
        className={
          solid
            ? "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
            : "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground"
        }
      >
        <Glyph name="close" size={14} colour={MUTED_INK} />
      </span>
    </Media>
  );
}

/**
 * `ui/fullscreen-image-viewer.tsx` — the close button and the two arrows, drawn
 * together because that is how a reader meets them: three chips of one recipe
 * pinned to the sides of one picture.
 */
function ViewerChips({ solid }: { solid: boolean }) {
  const chip = solid
    ? "rounded-full bg-background p-2 text-foreground"
    : "rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm";
  return (
    <Media art={ARENA} frame="h-32 w-full rounded-lg">
      <span className={`absolute right-2 top-2 ${chip}`}>
        <Glyph name="close" size={20} colour={INK} />
      </span>
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 ${chip}`}>
        <Glyph name="chevronLeft" size={24} colour={INK} />
      </span>
      <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${chip}`}>
        <Glyph name="chevronRight" size={24} colour={INK} />
      </span>
    </Media>
  );
}

/**
 * `voice/ScreenShareDisplay.tsx` — the sharer's name over the shared screen.
 *
 * The badge is `ui/badge.tsx` in its `secondary` variant with the fill
 * overridden, so what survives the merge is the violet's foreground ink on a
 * translucent page ground.
 */
function ScreenShareChip({ solid }: { solid: boolean }) {
  return (
    <Media art={ARENA} frame="aspect-video w-full rounded-lg border border-border">
      <span className="absolute left-2 top-2">
        <span
          className={
            solid
              ? "inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold text-world-foreground"
              : "inline-flex items-center rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-xs font-semibold text-world-foreground backdrop-blur-sm"
          }
        >
          Mikko is sharing their screen
        </span>
      </span>
    </Media>
  );
}

/** `voice/VoiceAvatar.tsx` — the muted mark, flush in the tile's corner. */
function VoiceAvatarChip({ solid }: { solid: boolean }) {
  return (
    <Media art={BADGE} frame="h-24 w-24 rounded-md">
      <span
        className={
          solid
            ? "absolute right-0 bottom-0 flex items-center justify-center rounded-tl-md bg-background p-[3px]"
            : "absolute right-0 bottom-0 flex items-center justify-center rounded-tl-md bg-background/85 p-[3px]"
        }
      >
        <Glyph name="micOff" size={12} colour={DESTRUCTIVE} />
      </span>
    </Media>
  );
}

/** `chat/ChatComposer.tsx` — the staged thumbnail's remove control. */
function ComposerChip({ solid }: { solid: boolean }) {
  return (
    <div className="inline-block rounded border border-border bg-muted p-1">
      <Media art={BADGE} frame="h-16 w-16 rounded">
        <span
          className={
            solid
              ? "absolute right-1 top-1 rounded-full bg-background p-0.5 text-foreground shadow-sm"
              : "absolute right-1 top-1 rounded-full bg-background/85 p-0.5 text-foreground shadow-sm"
          }
        >
          <Glyph name="close" size={14} colour={INK} />
        </span>
      </Media>
    </div>
  );
}

/** The five chip constructs, in one column, so the two columns compare row by row. */
function ChipColumn({ solid }: { solid: boolean }) {
  return (
    <div className="space-y-5">
      <Exemplar
        file="gedu/session-feed/SessionPhotoStrip.tsx"
        page="a session report, the photo strip"
      >
        <PhotoStripChip solid={solid} />
      </Exemplar>
      <Exemplar
        file="ui/fullscreen-image-viewer.tsx"
        page="any photo opened full screen"
      >
        <ViewerChips solid={solid} />
      </Exemplar>
      <Exemplar
        file="voice/ScreenShareDisplay.tsx"
        page="a club's voice room, while a screen is shared"
      >
        <ScreenShareChip solid={solid} />
      </Exemplar>
      <Exemplar file="voice/VoiceAvatar.tsx" page="the voice room's tile grid">
        <VoiceAvatarChip solid={solid} />
      </Exemplar>
      <Exemplar file="chat/ChatComposer.tsx" page="the chat composer, a staged photo">
        <ComposerChip solid={solid} />
      </Exemplar>
    </div>
  );
}

// ------------------------------------------------- over content: the glass

/**
 * `layout/dashboard-section-pill.tsx` — the section bar, pinned below the
 * header while the page runs under it.
 *
 * `bg-background/90`, dropping to `bg-background/70` where the browser supports
 * a backdrop filter. Drawn overlapping a card, a body line and an amber button,
 * because a ground that scrolls is the whole reason the fill is translucent:
 * what is under it is a different colour every scroll position.
 */
function GlassPill() {
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-border bg-background p-4">
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-semibold">Tuesday club — Espoo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wednesdays, 17:00 — eight gamers on the roster
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 items-center rounded-md bg-act px-4 text-sm font-semibold text-act-foreground">
            Buy a seat
          </span>
          <Media art={BADGE} frame="h-9 w-14 rounded" />
          <span className="text-sm text-muted-foreground">Two seats left</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Aino has been building the tower district since March.
        </p>
      </div>

      <nav className="absolute left-1/2 top-16 w-fit max-w-full -translate-x-1/2">
        <ul className="flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <li className="shrink-0">
            <span className="block rounded-full bg-act px-3 py-1.5 text-xs font-medium text-act-foreground sm:px-4 sm:text-sm">
              Overview
            </span>
          </li>
          <li className="shrink-0">
            <span className="block rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground sm:px-4 sm:text-sm">
              Aino
            </span>
          </li>
          <li className="shrink-0">
            <span className="block rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground sm:px-4 sm:text-sm">
              Billing
            </span>
          </li>
        </ul>
      </nav>
    </div>
  );
}

// --------------------------------------------------- over a known ground

type Draw = "alpha" | "solid" | "plain";

/**
 * `public/products/product-browse-filters.tsx` — the filter panel, `bg-card/50`
 * on the page ground.
 *
 * Chosen over the other four `bg-card/50` sites because it carries no alpha of
 * its own: the home feature card and the Roblox reasons card each hold a
 * `bg-act/10` icon tile, which is the next triple's subject and would leave a
 * translucent patch inside the column that is meant to be solid.
 */
function FilterPanel({ draw }: { draw: Draw }) {
  return (
    <div
      className={
        draw === "alpha"
          ? "rounded-xl border border-border bg-card/50 p-3 sm:p-4"
          : draw === "plain"
            ? "rounded-xl border border-border bg-card p-3 sm:p-4"
            : "rounded-xl border border-border p-3 sm:p-4"
      }
      style={draw === "solid" ? { backgroundColor: CARD_ON_GROUND } : undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Glyph name="sliders" size={14} colour={MUTED_INK} />
          Filter by
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
          <Glyph name="close" size={12} colour={INK} />
          Clear all
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase sm:w-14">
          Type
        </span>
        <span className="flex flex-1 gap-1.5">
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-act px-3 py-1.5 text-xs font-medium text-act-foreground shadow-sm">
            Clubs
          </span>
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80">
            Camps
          </span>
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80">
            Events
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * `admin/products/gedu-picker-sheet.tsx` — the spoken-language filter chips,
 * `bg-act/10 text-act` for the selected one, on the sheet's card ground.
 *
 * The whole strip is drawn, not the selected chip alone: an active fill is
 * judged against the chips it has to be distinguishable from.
 */
function LanguageChips({ draw }: { draw: Draw }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Speaks:</span>
        <span
          className={
            draw === "alpha"
              ? "rounded-full border border-border bg-act/10 px-2 py-0.5 text-act"
              : draw === "plain"
                ? "rounded-full border border-border bg-act px-2 py-0.5 text-act-foreground"
                : "rounded-full border border-border px-2 py-0.5"
          }
          style={
            draw === "solid"
              ? { backgroundColor: ACT_ON_CARD, color: BRAND.act.hex }
              : undefined
          }
        >
          Any
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
          Finnish
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
          Swedish
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
          English
        </span>
      </div>
    </div>
  );
}

/**
 * `auth/login-form.tsx` — the inline error, `bg-destructive/10 text-destructive`
 * inside the login card.
 *
 * `destructive` is question 2's and is not a library token, so all three
 * columns spell it. The alpha column spells it the way Tailwind would have
 * compiled the class, not the way this file would otherwise have composited it,
 * so the first two columns are still two different pieces of arithmetic
 * arriving at one colour.
 */
function InlineError({ draw }: { draw: Draw }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold">Welcome to School of Gaming</p>
      <div
        className="mt-3 rounded-md p-3 text-sm"
        style={
          draw === "alpha"
            ? {
                backgroundColor: tailwindAlpha(DESTRUCTIVE, 10),
                color: DESTRUCTIVE,
              }
            : draw === "plain"
              ? { backgroundColor: DESTRUCTIVE, color: GROUND }
              : { backgroundColor: DESTRUCTIVE_ON_CARD, color: DESTRUCTIVE }
        }
      >
        That email and password do not match.
      </div>
    </div>
  );
}

/**
 * `gedu/GeduAssignmentCard.tsx` — the roster meta line, whose separator is
 * `text-muted-foreground/50` beside muted ink at full value.
 *
 * The app draws that separator as a `::before` pseudo-element, because it is
 * punctuation between two translated strings and has no business in a message
 * file. Here it is a real element: what is being ruled on is its colour, and a
 * colour spelled three ways has to be reachable from an inline style in two of
 * them.
 */
function RosterMeta({ draw }: { draw: Draw }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Tuesday group</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <span
            className={
              draw === "alpha"
                ? "text-muted-foreground/50"
                : draw === "plain"
                  ? "text-muted-foreground"
                  : undefined
            }
            style={
              draw === "solid" ? { color: MUTED_INK_ON_CARD } : undefined
            }
          >
            &middot;
          </span>
          <Glyph name="users" size={14} colour={MUTED_INK} />8 gamers
        </span>
      </p>
    </div>
  );
}

/** One construct, drawn the three ways, over the ground it really sits on. */
function Triple({
  file,
  page,
  step,
  token,
  solidLabel,
  render,
}: {
  file: string;
  page: string;
  step: string;
  token: string;
  solidLabel: string;
  render: (draw: Draw) => React.ReactNode;
}) {
  return (
    <Compare columns={3}>
      <Panel label={step}>
        <Exemplar file={file} page={page}>
          {render("alpha")}
        </Exemplar>
      </Panel>
      <Panel label={solidLabel}>
        <Exemplar file={file} page={page}>
          {render("solid")}
        </Exemplar>
      </Panel>
      <Panel label={token}>
        <Exemplar file={file} page={page}>
          {render("plain")}
        </Exemplar>
      </Panel>
    </Compare>
  );
}

export function AlphaSection() {
  return (
    <Question n={8} title="Colour at an alpha step">
      <Case title="A scrim over media">
        <Compare columns={3}>
          <Panel label="Black at 50%">
            <Exemplar
              file="ui/dialog.tsx, ui/sheet.tsx"
              page="every confirm dialog, and the filter sheet"
            >
              <DialogScrim />
            </Exemplar>
          </Panel>
          <Panel label="Black at 60%">
            <Exemplar
              file="family/ProfileTiles.tsx"
              page="/parent, a profile tile mid-switch"
            >
              <TileScrim />
            </Exemplar>
          </Panel>
          <Panel label="Background at 80%">
            <Exemplar
              file="ui/fullscreen-image-viewer.tsx"
              page="a session report, a photo opened full screen"
            >
              <ViewerScrim />
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="A chip over media">
        <Compare columns={2}>
          <Panel label="Today — at an alpha step">
            <ChipColumn solid={false} />
          </Panel>
          <Panel label="Solid — bg-background">
            <ChipColumn solid />
          </Panel>
        </Compare>
      </Case>

      <Case title="Glass over scrolling content">
        <Exemplar
          file="layout/dashboard-section-pill.tsx"
          page="/parent, /gamer and /gedu, under the header"
        >
          <GlassPill />
        </Exemplar>
      </Case>

      <Case title="Over a known ground">
        <div className="space-y-10">
          <Triple
            file="public/products/product-browse-filters.tsx"
            page="/products, the filter panel"
            step="bg-card/50"
            solidLabel={CARD_ON_GROUND}
            token="bg-card"
            render={(draw) => <FilterPanel draw={draw} />}
          />
          <Triple
            file="admin/products/gedu-picker-sheet.tsx"
            page="/admin/products/[id], assigning a gedu"
            step="bg-act/10"
            solidLabel={ACT_ON_CARD}
            token="bg-act"
            render={(draw) => <LanguageChips draw={draw} />}
          />
          <Triple
            file="auth/login-form.tsx"
            page="/login, a rejected sign-in"
            step="bg-destructive/10"
            solidLabel={DESTRUCTIVE_ON_CARD}
            token="bg-destructive"
            render={(draw) => <InlineError draw={draw} />}
          />
          <Triple
            file="gedu/GeduAssignmentCard.tsx"
            page="/gedu, an assignment card"
            step="text-muted-foreground/50"
            solidLabel={MUTED_INK_ON_CARD}
            token="text-muted-foreground"
            render={(draw) => <RosterMeta draw={draw} />}
          />
        </div>
      </Case>
    </Question>
  );
}

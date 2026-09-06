/**
 * Question 7 — the scrim and the glass.
 *
 * **What is left of this question.** It opened as every utility carrying a `/n`
 * modifier — 269 sites in 119 files, regenerated with
 *
 *     grep -rhoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline|fill|stroke)-[a-z0-9-]+/[0-9]+" src --include=*.tsx --include=*.ts | sed -E 's/^([a-z]+)-(.*)\/([0-9]+)$/\2/' | sort | uniq -c | sort -rn
 *
 * — and it has been ruled in parts. The known-ground triples are gone from this
 * page: they were four constructs drawn three ways, the alpha step beside its
 * own composited solid beside the plain token, and the first two columns landing
 * on the same pixels was the whole argument. It was made and it was accepted, so
 * the drawing has done its work and the reasoning lives in the ledger. The state
 * cases are gone for the same reason: opacity on a whole element as a disabled
 * state is a component's recipe, not a colour, and that is settled. Act and world
 * at an alpha step have left this section for one of their own, question 8.
 *
 * **What is left is a strength and a colour.** The ruling was that the library
 * defines exactly one scrim and one glass, and that Sogverse writes no `/n`
 * anywhere. It did not say how strong either is, and it did not say whether the
 * scrim is black or the page's own ground — two questions that can only be
 * answered by looking, over the brightest thing either one has to cover.
 *
 * **Six strengths are in use today and none of them was chosen.** The scrim is
 * `bg-black/50` in the dialog and the sheet, `bg-black/60` on a profile tile
 * mid-switch, `bg-background/80` in the fullscreen viewer; the glass is
 * `bg-background/80`, `/85` and `/90` across five files, with the section pill
 * carrying `/90` and a `supports-[backdrop-filter]:bg-background/70` beneath it.
 * That spread is drift rather than design, which is what makes one value the
 * ruling: the candidates below are four strengths for the scrim and three for
 * the glass, and each is drawn at every place the answer has to work.
 *
 * **The scrim is drawn three ways at once, per candidate**, because it has three
 * jobs and one value has to serve all of them: a dialog's card sitting on top of
 * it, the fullscreen viewer's own control sitting on top of it, and the same
 * scrim over the page it was really opened from — a dialog's backdrop covers a
 * dashboard far more often than it covers a photograph, and a value tuned only
 * against a picture will be wrong there.
 *
 * **The glass is drawn over both grounds it meets**, a photograph and the page
 * scrolling under it, with and without the `backdrop-blur-sm` the sites already
 * carry, and beside a fully solid `bg-background` — because "solid" is a real
 * answer for a chip and the row is not honest without it. The pill's
 * `supports-[backdrop-filter]` second value is not drawn: it is a sixth strength
 * that exists only because nobody picked a first one, and it goes with the
 * ruling either way.
 *
 * **The images.** Two files copied from Sogverse's `public/preview-art/` into
 * the demo's own `public/ruling-art/`, because the demo is a separate Next app
 * with a separate static root and cannot reach the consumer's. They are deleted
 * with this directory. Each scrim and chip sits over a region carrying both the
 * dark violet corner and the bright salmon-and-gold corner, so the alpha is seen
 * doing its work at both ends rather than over one convenient midtone.
 */

import Image from "next/image";
import { ChevronLeft, ChevronRight, MicOff, X } from "lucide-react";
import { NEUTRALS } from "../../../src/tokens/brand";
import { alpha } from "./colour";
import {
  CARD,
  Case,
  Compare,
  EDGE,
  Exemplar,
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
 * The two colours a scrim could be, and the only two.
 *
 * True black is what the dialog and the tile use today; the page's own ground is
 * what the fullscreen viewer uses. They are one step apart in the abstract and
 * visibly different over a bright picture, which is the whole reason the choice
 * is drawn rather than argued: `background` is a warm near-black that keeps a
 * little of the picture's colour, and black takes all of it.
 */
const SCRIM_COLOURS = {
  black: BLACK,
  background: NEUTRALS.background.hex,
} as const;

type ScrimColour = keyof typeof SCRIM_COLOURS;

/** The four strengths in the running, spanning the three the app uses today. */
const SCRIM_STRENGTHS = [0.5, 0.6, 0.7, 0.8] as const;

/**
 * The three glass strengths in use, plus solid.
 *
 * Written as classes rather than as arithmetic, because `bg-background/85` is
 * the app's own spelling and a chip drawn from `alpha()` would be this file's
 * arithmetic wearing the app's clothes.
 */
const GLASS_FILLS = [
  "bg-background/80",
  "bg-background/85",
  "bg-background/90",
  "bg-background",
] as const;

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

// -------------------------------------------------------------- the scrim

/**
 * `ui/dialog.tsx` and `ui/sheet.tsx` — the backdrop with the dialog's card on
 * it, over a photograph.
 *
 * The dialog's own `backdrop-blur-sm` travels with the scrim; the sheet takes
 * the same fill without it, and whichever strength wins has to work both ways.
 */
function DialogOverArt({ fill }: { fill: string }) {
  return (
    <Media art={ARENA} frame="h-44 w-full rounded-lg">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: fill }}
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
 * `ui/fullscreen-image-viewer.tsx` — the viewer's own scrim with its close
 * control on it, over the photograph the viewer was opened from.
 *
 * The control is the part that makes this different from the dialog: a card is
 * an opaque block that only has to be *found* against the scrim, while a chip is
 * a small translucent thing that has to stay legible on top of it.
 */
function ViewerOverArt({ fill }: { fill: string }) {
  return (
    <Media art={ARENA} frame="h-44 w-full rounded-lg">
      <div className="absolute inset-0" style={{ backgroundColor: fill }} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Media art={BADGE} frame="h-28 w-24 rounded-lg" />
      </div>
      <span className="absolute right-2 top-2 rounded-full bg-background/80 p-2 backdrop-blur-sm">
        <Glyph icon={X} size={18} colour={INK} />
      </span>
    </Media>
  );
}

/**
 * The same scrim over the ground it actually covers most of the time: a page.
 *
 * A dialog is opened from a dashboard far more often than from a photograph, so
 * a value picked only against a picture would be picked against the rarer case.
 */
function DialogOverPage({ fill }: { fill: string }) {
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-lg border border-border bg-background p-3">
      <div className="space-y-2">
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="text-xs font-semibold">Tuesday club — Espoo</p>
          <p className="text-xs text-muted-foreground">Session report</p>
        </div>
        <span className="inline-flex h-8 items-center rounded-md bg-act px-3 text-xs font-semibold text-act-foreground">
          Buy a seat
        </span>
        <p className="text-xs text-muted-foreground">
          Aino has been building the tower district since March.
        </p>
      </div>
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: fill }}
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
    </div>
  );
}

/** One candidate: the three jobs one scrim value has to do, stacked. */
function ScrimStack({
  colour,
  strength,
}: {
  colour: ScrimColour;
  strength: number;
}) {
  const fill = alpha(SCRIM_COLOURS[colour], strength);
  return (
    <div className="space-y-5">
      <Exemplar
        file="ui/dialog.tsx, ui/sheet.tsx"
        page="every confirm dialog, over a photo"
      >
        <DialogOverArt fill={fill} />
      </Exemplar>
      <Exemplar
        file="ui/fullscreen-image-viewer.tsx"
        page="a session report, a photo opened full screen"
      >
        <ViewerOverArt fill={fill} />
      </Exemplar>
      <Exemplar
        file="ui/dialog.tsx"
        page="every confirm dialog, over the page it opened from"
      >
        <DialogOverPage fill={fill} />
      </Exemplar>
    </div>
  );
}

// -------------------------------------------------------------- the glass

/**
 * `ui/fullscreen-image-viewer.tsx` — the close control and the two arrows,
 * drawn together because that is how a reader meets them: three chips of one
 * recipe pinned to the sides of one picture.
 *
 * `voice/VoiceAvatar.tsx`, `chat/ChatComposer.tsx` and
 * `gedu/session-feed/SessionPhotoStrip.tsx` write the same chip at `/85` and
 * `/90`; one strength answers all four files.
 */
function ViewerChips({ fill, blur }: { fill: string; blur: boolean }) {
  const chip = blur
    ? `rounded-full ${fill} p-2 text-foreground backdrop-blur-sm`
    : `rounded-full ${fill} p-2 text-foreground`;
  return (
    <Media art={ARENA} frame="h-32 w-full rounded-lg">
      <span className={`absolute right-2 top-2 ${chip}`}>
        <Glyph icon={X} size={20} colour={INK} />
      </span>
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 ${chip}`}>
        <Glyph icon={ChevronLeft} size={24} colour={INK} />
      </span>
      <span className={`absolute right-2 top-1/2 -translate-y-1/2 ${chip}`}>
        <Glyph icon={ChevronRight} size={24} colour={INK} />
      </span>
    </Media>
  );
}

/** `voice/VoiceAvatar.tsx` — the muted mark, flush in the tile's corner. */
function VoiceAvatarChip({ fill, blur }: { fill: string; blur: boolean }) {
  return (
    <Media art={BADGE} frame="h-24 w-24 rounded-md">
      <span
        className={
          blur
            ? `absolute right-0 bottom-0 flex items-center justify-center rounded-tl-md ${fill} p-[3px] backdrop-blur-sm`
            : `absolute right-0 bottom-0 flex items-center justify-center rounded-tl-md ${fill} p-[3px]`
        }
      >
        <Glyph icon={MicOff} size={12} colour={DESTRUCTIVE} />
      </span>
    </Media>
  );
}

/**
 * `layout/dashboard-section-pill.tsx` — the section bar, pinned below the
 * header while the page runs under it.
 *
 * Drawn overlapping a card, a body line and an amber button, because a ground
 * that scrolls is the whole reason the fill is translucent: what is under it is
 * a different colour at every scroll position.
 */
function GlassPill({ fill, blur }: { fill: string; blur: boolean }) {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-lg border border-border bg-background p-4">
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

      <nav className="absolute left-1/2 top-14 w-fit max-w-full -translate-x-1/2">
        <ul
          className={
            blur
              ? `flex items-center gap-1 overflow-x-auto rounded-full border border-border ${fill} p-1 shadow-lg backdrop-blur-sm`
              : `flex items-center gap-1 overflow-x-auto rounded-full border border-border ${fill} p-1 shadow-lg`
          }
        >
          <li className="shrink-0">
            <span className="block rounded-full bg-act px-3 py-1.5 text-xs font-medium text-act-foreground">
              Overview
            </span>
          </li>
          <li className="shrink-0">
            <span className="block rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Aino
            </span>
          </li>
          <li className="shrink-0">
            <span className="block rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Billing
            </span>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** One candidate: the chip over a picture, the mark on a tile, the pill over the page. */
function GlassStack({ fill, blur }: { fill: string; blur: boolean }) {
  return (
    <div className="space-y-5">
      <Exemplar
        file="ui/fullscreen-image-viewer.tsx"
        page="any photo opened full screen"
      >
        <ViewerChips fill={fill} blur={blur} />
      </Exemplar>
      <Exemplar file="voice/VoiceAvatar.tsx" page="the voice room's tile grid">
        <VoiceAvatarChip fill={fill} blur={blur} />
      </Exemplar>
      <Exemplar
        file="layout/dashboard-section-pill.tsx"
        page="/parent, /gamer and /gedu, under the header"
      >
        <GlassPill fill={fill} blur={blur} />
      </Exemplar>
    </div>
  );
}

export function AlphaSection() {
  return (
    <Question n={7} title="The scrim and the glass">
      <Case title="A scrim, in black">
        <Compare columns={4}>
          {SCRIM_STRENGTHS.map((strength) => (
            <Panel key={strength} label={`black ${strength * 100}%`}>
              <ScrimStack colour="black" strength={strength} />
            </Panel>
          ))}
        </Compare>
      </Case>

      <Case title="A scrim, in the page ground">
        <Compare columns={4}>
          {SCRIM_STRENGTHS.map((strength) => (
            <Panel key={strength} label={`background ${strength * 100}%`}>
              <ScrimStack colour="background" strength={strength} />
            </Panel>
          ))}
        </Compare>
      </Case>

      <Case title="A glass, with backdrop-blur-sm">
        <Compare columns={4}>
          {GLASS_FILLS.map((fill) => (
            <Panel key={fill} label={fill}>
              <GlassStack fill={fill} blur />
            </Panel>
          ))}
        </Compare>
      </Case>

      <Case title="A glass, with no blur">
        <Compare columns={4}>
          {GLASS_FILLS.map((fill) => (
            <Panel key={fill} label={fill}>
              <GlassStack fill={fill} blur={false} />
            </Panel>
          ))}
        </Compare>
      </Case>
    </Question>
  );
}

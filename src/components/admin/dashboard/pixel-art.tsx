/**
 * The dashboard's pixel sprites, drawn in the artwork's own palette.
 *
 * **Why a sprite at all.** The all-clear had become the one state on this page
 * with nothing to look at — an icon and a paragraph centred in the space the
 * queue used to fill, which reads as an *empty* panel rather than a *cleared*
 * one. A drawn mark is what makes that difference legible at a glance, and a
 * pixel one is the register this platform speaks in: the audience is a games
 * company's own staff. The title beside it is plain Poppins — the sprite is
 * illustration and keeps its register whatever the type does.
 *
 * **Drawn here rather than shipped as an asset.** A 9x10 sprite is smaller as
 * markup than as any image file, needs no network round trip on a page whose
 * whole design is that it has no loading state, and stays editable as a picture
 * rather than as a binary — a cell moves by editing one character of a string.
 *
 * **Nothing here animates, and that is a property of the surface rather than an
 * omission.** The all-clear was prototyped with motion — a particle burst, a
 * draw-on check, a badge pop — and every one of them vanished under
 * `prefers-reduced-motion: reduce`, which is how one of this platform's own
 * admins reads every page. A reward half the audience never receives is not a
 * reward, so the satisfaction is carried by composition alone and there are no
 * keyframes here to disable.
 */

/**
 * **The sprites' own palette, and it is deliberately not the brand's**
 * *(owner ruling, 2026-09-01: "It shouldn't need an exception because it
 * shouldn't be using brand colors. It's art.")*.
 *
 * **Artwork never references brand tokens.** These sprites used to draw in
 * `--primary` and its 55% shade, which made a trophy's gold and the brand's
 * amber one value: the day the brand hue moves, a cup would move with it for no
 * reason anybody could name, and the shading rule — which governs *UI* uses of
 * the brand tokens — would have to grow an exception to permit the shade. A
 * picture carries its own colours instead, and both problems go away rather than
 * being negotiated. So: a trophy's gold, which happens to look like gold.
 *
 * They are opaque literals rather than alphas for the same reason they are
 * literals at all — an alpha is a dependency on whatever ground the sprite is
 * placed over, and a picture should look the same wherever it is drawn. The
 * shade is the old 55% amber composited once against the card it sat on, so the
 * cup renders pixel-for-pixel as it did.
 *
 * One glyph per cell, one row per string, every row the same width. Upper case
 * is the full-strength colour and lower case its shade — the whole shading
 * vocabulary a sprite this size can use. A glyph the map does not know draws
 * nothing, which is what `.` relies on: the type is `Partial` so that missing
 * entry is a `string | undefined` the compiler can see, rather than a lie the
 * lookup tells its caller.
 *
 * **Only `P`, `p` and `f` are on screen today** — they are the cup. `M` and `F`
 * are reachable only through `FIREWORK_BURST` below, which is deliberately not
 * rendered, so anybody retuning these colours should know that changing those
 * two changes nothing an admin sees.
 */
const PIXEL_COLORS: Partial<Record<string, string>> = {
  ".": "",
  /** Trophy gold. */
  P: "#FAA901",
  /** Trophy gold in shadow — the cup's inner bowl and stem. */
  p: "#95690C",
  /** Spark violet, on the unrendered firework's tips. */
  M: "#8F00E2",
  /** The firework's white core. */
  F: "#EDEDED",
  /** The plinth the cup stands on. */
  f: "#A6A6A6",
};

export interface PixelArt {
  readonly rows: readonly string[];
}

/**
 * The trophy cup, on a 9x10 grid.
 *
 * The grid is small on purpose. A card header's line is about thirty pixels
 * tall, and a finer grid only fits that at two screen pixels per art pixel — the
 * size at which a one-cell handle or rim stops reading as anything at all.
 * Shrinking the *grid* rather than the *pixel* is what keeps each pixel chunky
 * enough to see, which is the entire appeal of drawing it this way.
 */
export const TROPHY_CUP: PixelArt = {
  rows: [
    ".PPPPPPP.",
    "PPpppppPP",
    "P.ppppp.P",
    "P.ppppp.P",
    ".PPpppPP.",
    "...PPP...",
    "...PPP...",
    "..PPPPP..",
    ".PPPPPPP.",
    ".fffffff.",
  ],
};

/**
 * A firework burst: gold rays from a white core, secondary sparks at the tips.
 *
 * **Deliberately unrendered.** It was drawn for the all-clear header and cut
 * from it by the owner, who specified that row as the wordmark, the cup and the
 * check and nothing else. It is kept because keeping it costs ten lines and
 * redrawing it costs an afternoon — if the header is ever asked for the flourish
 * again it is one `<PixelSprite art={FIREWORK_BURST} />` away. Delete it the day
 * that question is closed for good.
 */
export const FIREWORK_BURST: PixelArt = {
  rows: [
    "...M...",
    ".M.P.M.",
    "..PPP..",
    "MPPFPPM",
    "..PPP..",
    ".M.P.M.",
    "...M...",
  ],
};

/**
 * A sprite, drawn as a stack of cell rows at three screen pixels per art pixel.
 *
 * The size is fixed rather than a prop because there is one place these are
 * drawn — a card header — and one size that fits it: the cup lands at 27x30,
 * which sits on a header line beside a heading and an icon without setting the
 * row's height. Squares, no rounding and no gap; anything else stops reading as
 * pixels.
 *
 * `aria-hidden`, because it is a picture of what the words beside it already
 * say. A screen reader announcing it would be reading the same fact twice.
 */
export function PixelSprite({ art }: { art: PixelArt }) {
  return (
    <div className="flex shrink-0 flex-col" aria-hidden>
      {art.rows.map((row, y) => (
        <div key={y} className="flex">
          {[...row].map((glyph, x) => (
            // An inline background rather than a class: these are the artwork's
            // own colours, not tokens, and a Tailwind class would put them back
            // in the design system they were just taken out of.
            <span
              key={x}
              className="h-[3px] w-[3px]"
              style={{ backgroundColor: PIXEL_COLORS[glyph] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

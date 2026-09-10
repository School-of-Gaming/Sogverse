/**
 * **The product detail page's column tracks, stated once.**
 *
 * The page body and its loading skeleton draw the same grid — the skeleton is
 * a picture of the body, and a picture drawn from a second copy of the template
 * drifts the day one copy is edited. So both import these two strings, and the
 * three widths inside them are CSS variables declared beside `--header-height`
 * in `globals.css`: the signup rail, the facts rail and the reading column each
 * have exactly one number, and a change to any of them reaches every template,
 * both files and the header band in one edit.
 *
 * Two templates rather than one because the header band has to MIRROR the
 * content tracks without the gutters — it spans the same columns as the panels
 * beneath it, so an equal template distributes equal widths and its cells line
 * up with the columns below without subgrid. The band's template is therefore
 * the outer template minus its `1fr` gutters, and it is written out here beside
 * the outer one so the two are edited together or not at all.
 *
 * The width budget itself — why these three numbers, and what they measure to
 * at each viewport — is explained where the grid is placed, in the page body.
 */

/**
 * The outer page grid. Below `lg` it is the ordinary centred container and the
 * page is one column; from `lg` three tracks — gutter, reading column, signup
 * rail — with the container's cap dropped so the rails can live in the
 * viewport's margins; from `2xl` five, with the facts rail on the left and a
 * second gutter on the right.
 */
export const DETAIL_GRID_CLASS =
  "container mx-auto space-y-6 px-4 py-8 sm:py-12 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--reading-column-width))_var(--signup-rail-width)] lg:gap-6 lg:space-y-0 2xl:grid-cols-[minmax(0,1fr)_var(--facts-rail-width)_minmax(0,var(--reading-column-width))_var(--signup-rail-width)_minmax(0,1fr)]";

/**
 * The header band: row 1 of the outer grid, spanning the content tracks only,
 * and itself a grid whose template mirrors those tracks so each header element
 * sits over the column it belongs to.
 */
export const DETAIL_BAND_CLASS =
  "lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:grid lg:grid-cols-[minmax(0,var(--reading-column-width))_var(--signup-rail-width)] lg:gap-6 2xl:col-start-2 2xl:col-span-3 2xl:grid-cols-[var(--facts-rail-width)_minmax(0,var(--reading-column-width))_var(--signup-rail-width)]";

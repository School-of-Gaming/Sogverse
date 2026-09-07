/**
 * The brand's colours, defined once.
 *
 * This is the foundations tier's single typed source of truth for the colours
 * the brand *speaks* — the grounds, the ink, the signature pair, the families.
 * Two siblings spell a hex and neither is a brand colour: `picks.ts` holds the
 * sixteen a person may choose for their own thing, and `surfaces.ts` holds the
 * black the scrim dims with, which is not a hue at all but the absence of one.
 * A colour anywhere else in the package is a defect lint catches.
 *
 * `theme.css` beside this file is generated from here (`npm run tokens
 * --workspace=@sog/ui`), so a value moves in one place; anything that cannot
 * read CSS — an email, a canvas, an OG image — imports these constants instead.
 *
 * Every colour is authored as hex, uppercase, six digits. Anything derived from
 * one — a contrast ratio, an HSL triple, a composited tint — is computed by a
 * function, never rounded by hand: a hue hand-converted twice is two hues, and
 * the drift is invisible until somebody puts the two next to each other.
 *
 * **Nothing is defined here before something consumes it.** The hues and the
 * families are the brand's identity and exist on their own account; everything
 * else — a scale, a state colour, a semantic alias — arrives with the component
 * that spends it. A token defined ahead of need is a token whose first real use
 * inherits a decision nobody made for it.
 *
 * **There is one theme and it is dark.** The grounds are near-black, the ink on
 * them is a step down from white, and every text-on-ground pairing the library
 * offers is measured in `contrast.ts` against the grounds it actually sits on.
 * A colour the library offers for text on a ground is safe there; a pairing the
 * library does not offer is not available.
 *
 * ## How colour is spent
 *
 * The palette is loud on purpose, and the loudness is placed rather than
 * banned. How much of it a surface may spend is decided by who is reading, not
 * by what the surface is made of.
 *
 * **A surface where a parent is asked to trust us or to pay spends act alone,
 * a surface telling the story to a mixed audience spends act plus one, a
 * gamer surface may spend the palette, and no page spends all six.** The budget
 * is stated in full — with the reasoning behind each tier — in the package's
 * `CLAUDE.md`, which is where a concept rule lives; this file holds the values,
 * not the rule for how many of them one page may reach for.
 *
 * ## The rules that hold everywhere
 *
 * - **Act wins the main call to action** and the moments meant to feel
 *   like us. It is the colour most associated with School of Gaming, so one
 *   act thing on a screen is read as the thing to do — and two make neither
 *   of them it.
 * - **World sets the tone of the world**: launches, big news, lore, display
 *   and identity, the electric and high-energy moments. It is never the colour
 *   of quiet, safety or trust-building copy addressed to a parent, because it
 *   is loud exactly where that copy has to be steady, and excitement is the
 *   wrong promise to make about a child's safety.
 * - **A family accents content; it is never the ground under a long passage of
 *   text.** A family's job is to say which relationship a piece serves, and a
 *   hue spread under a paragraph stops being a signal and becomes the
 *   conditions the reader is reading in.
 * - **Never all six colours on one page.** Act plus one supporting family is
 *   the default. Six hues in one frame is not a code a reader can decode; it is
 *   noise wearing brand colours.
 * - **Colour-coding follows the value a piece serves**, wherever colour codes
 *   anything: harmony for community, friendship and testimonials; glow for
 *   growth, milestones and progress; valor for challenges, camps and courage;
 *   wit for learning, tips and how-to; world for launches and announcements;
 *   act for general brand and calls to action. A club page carries its
 *   dominant element's colour as a cue on the same mapping. One mapping
 *   everywhere is the only thing that makes the cue legible: a hue meaning one
 *   thing on a card and another in a feed means nothing in either.
 * - **Meaning never travels by hue alone.** A colour-coded element also carries
 *   a glyph and a label, because a meaningful share of gamers are colourblind,
 *   and a cue they cannot see is a cue that is not there.
 * - **Anything a reader reads through is ink or white**, and never at a ratio
 *   nobody measured. Colour reaches a reader as a fill, an edge, a ring, a mark
 *   or a **label**, and the label is the one place colour is set as type: the
 *   name of a state or a value — "Cancelled", "Glow", "Past due", "3 seats
 *   left" — short because names are, with no verb and no sentence punctuation,
 *   on a neutral ground, beside a glyph in the same hue so that removing the
 *   colour loses nothing. Body copy, descriptions, headings, links, error
 *   sentences and help text stay ink or white, because a parent is never
 *   *talked to* in these colours. The rule is restated on each family and each
 *   status below, beside the value it binds. Which of the two roles a colour
 *   takes at a given site — a figure that names, or a fill that is pressed —
 *   is the package's `CLAUDE.md`, beside the no-alpha rule it completes.
 * - **Declared departure: a public page's hero headline.** A hero sits
 *   between artwork and a heading and falls cleanly into neither, so it takes
 *   a display treatment rather than the ink the bullet above would give it:
 *   **one phrase in `act`, the rest in ink, and the `world` rule beneath the
 *   headline carrying the second colour** — the page and its social card
 *   drawing the same three things, so a share and the page it lands on say
 *   one thing. The act phrase is the payoff, the words the headline is
 *   travelling towards, and there is exactly one of them: a second coloured
 *   phrase spends the accent twice and the rule already holds the other hue.
 *   **It is the one heading that may.** A section heading is not a hero — it
 *   has no rule under it and a reader reads straight through it — so a
 *   coloured word in one is the defect this departure is narrow enough to
 *   keep catching.
 * - **A brand colour exists at exactly the values authored below, never at an
 *   alpha step**: over a near-black ground an alpha step composites to a
 *   darker, duller hue, so what the reader sees is no longer the brand. This
 *   binds the signature pair, the four families, the statuses and the picks. A
 *   ground that needs to lift goes to a neutral, and a surface that genuinely
 *   has to see through — over a photograph, a video, a page scrolling beneath
 *   it — takes one of the constructs in `surfaces.ts`, none of which is a
 *   colour the brand speaks. **A tile behind a mark is not an exception**,
 *   and was the last one claimed: a chip-scale square of the hue at a tenth,
 *   behind a glyph already inked in that hue, is the same colour stated twice
 *   — once at its authored value and once at a duller one. So a **glyph tile
 *   is the lifted neutral with an edge in its glyph's hue**: the square keeps
 *   the neutral, the mark keeps the colour, and the line around it states the
 *   hue a second time at full value rather than at a fraction. A tile whose
 *   glyph is the quiet ink has no hue to draw and keeps the plain fill. What
 *   is left is artwork carrying its own palette, which is not the brand
 *   speaking at all.
 * - **The ban is on the brand, and a neutral is not the brand speaking.** The
 *   greys carry no meaning to protect: they are the ground, the ink and the
 *   edge, and a grey at a fraction of itself misrepresents nothing. So a
 *   neutral may carry an alpha in the one situation where the alpha does a job
 *   a solid cannot — **a layer over a ground it does not know.** There are
 *   three such jobs, they are the library's, and they are all defined in
 *   `surfaces.ts`: the scrim over media, the glass over whatever scrolls
 *   beneath it, and the hover layer over whatever surface an element sits on.
 *   Each carries its own alpha so no call site can vary it. **A grey at alpha
 *   used as an ink is not one of them**: nothing moves beneath a word, so the
 *   alpha is doing no work a solid could not, and what it produces is a duller
 *   grey the theme already names. There are two inks and a quiet one is one of
 *   them.
 * - **Nothing composites by hand.** A brand value flattened against a ground so
 *   that a renderer with no alpha can draw it — a mail client, a satori-rendered
 *   social card — is still the brand colour at an alpha step; it is simply
 *   wearing a solid’s clothes, and no reader can tell the difference. Those
 *   renderers take the authored value on the ground, exactly as the app does.
 *   The three constructs above are the exception that proves the shape of this
 *   one: they composite at render time, over a ground nobody could have
 *   flattened them against in advance.
 *
 * These are opinions with no renderable form, which is why they are written
 * here rather than exported as data. Each one the API can enforce — a component
 * that takes a meaning instead of a hue, a variant that cannot be handed an
 * alpha — is enforced there instead of restated in a page.
 *
 * ## The dark ground
 *
 * The palette's rules are written for white and off-white grounds carrying ink
 * text. This theme is dark. It is one deliberate reading of that palette rather
 * than a second palette: not a hue moves, and what changes is which hues are
 * safe to set text in and which neutrals exist at all. Every change the reading
 * makes is listed here; a change not listed here is not a change the library
 * makes.
 *
 * **The neutrals are the theme's own.** Ground `#121212`, ink `#EDEDED`, card
 * `#1A1A1A`, the lifted ground `#262626`, quiet ink `#A6A6A6` and border
 * `#333333` are not derived from light values and have no light counterparts
 * to be derived from — a light palette has a page, a card tint, a divider grey
 * and a secondary-text grey, and none of them is one of these. Two of them are
 * the light palette's own ends put to different work: the ground is the brand's
 * ink, used as a surface, and the ink is one step down from white so a full
 * page of body copy does not glare back. The rest are the ladder that a dark
 * page needs and a light one does not.
 *
 * **The ladder is three grounds, and that is a decision rather than an
 * inventory.** It ran to four — the page, the card, a hover fill and a quieter
 * one above it — and the four steps sat between 1.08 and 1.24 apart, which is
 * a difference the eye does not reliably find. The hover step in particular was
 * invisible on the card, which is where most of a dashboard's lists live, so
 * the one state it existed to draw was the one it could not draw. And the
 * fourth step only bought its second state grey by spending the quiet ground on
 * a state, against that ground's own definition. Three steps buy back a lift
 * that can actually be seen and cost one distinction, which is now carried by
 * an edge, a mark or ink — signals that survive a reader who cannot separate
 * two near-black greys at all.
 *
 * **And the hover step was never a ground.** What made it invisible on the card
 * is what a fourth ground could not have fixed: a hover fill spelled as a grey
 * has to name the ground it lands on, so it is right on one surface and wrong
 * on the rest. Spelled as a layer — the ink at a low alpha, laid over whatever
 * is underneath — it needs no ground at all and lifts every one of the three by
 * the same visible step. That layer is `HOVER` in `surfaces.ts`, beside the
 * scrim and the glass, because it is the same trick those two are for: an alpha
 * doing a job a solid cannot, over a ground it does not know.
 *
 * **Act keeps its intent and loses its arithmetic.** On a light ground act
 * misses the body floor by a wide margin, which is why it is a fill and a
 * large-graphic colour there and never body copy or a small link. On this
 * ground it clears that floor easily, and it is still not body copy: act is a
 * fill and a mark. It is the one colour on the screen that says *press this*,
 * and a paragraph set in it spends that signal on a paragraph. So the
 * restriction stands here for the reason the brand holds it, rather than for
 * the measurement that used to enforce it.
 *
 * **The brand's strong/soft pair does not survive the reading, and each family
 * is one colour.** The brand fixes two values per family, tuned against a white
 * page, where the darker half is the one that separates from the ground and the
 * lighter half is decorative. On `#121212` that turns over: the lighter value is
 * the one that lifts, and a saturated mid-tone chosen to hold its own against
 * white sinks into a near-black card and reads as a duller version of the hue.
 * Drawn in every construct, one value per family carried every role — fill,
 * edge, ring, mark, label ink, glyph — and a second value bought nothing but a
 * choice repeated at each call site. So the theme emits one token per family,
 * and each entry records the brand's other value rather than shipping it.
 * `contrast.ts` holds every pairing the library ships and the floor each one is
 * held to.
 *
 * **Every text-on-ground pairing is re-proven on these grounds.** Nothing is
 * inherited from the light reading, including the pairings that would have been
 * safe there: each is measured again against the three grounds this theme
 * actually fills, and a pairing the library does not list is a pairing it does
 * not offer.
 */

/** A six-digit uppercase hex colour. The only colour literal shape this package accepts. */
export type Hex = `#${string}`;

// ---------------------------------------------------------------- neutrals

/**
 * The neutrals the theme declares.
 *
 * Named as a union rather than derived from `NEUTRALS` below, so the object is
 * checked against the list instead of defining it: a neutral in one and not the
 * other is a compile error, and every entry is forced to satisfy the surface
 * contract rather than inferring its way out of it.
 */
export type NeutralId =
  | "background"
  | "foreground"
  | "card"
  | "lifted"
  | "mutedForeground"
  | "border";

/**
 * The neutrals a component **fills** — a ground with text on it — and so the
 * exact set that carries an `on`.
 *
 * Three, and together they are the whole ladder a dark page climbs: the page
 * itself, the lift a card takes off it, and one further lift above both, for
 * anything raised off what is behind it. Everything else in the set is ink or
 * an edge, and neither is filled.
 */
type SurfaceId = "background" | "card" | "lifted";

/**
 * A surface names the token that reads *on* it; anything else does not.
 *
 * The split is the point. `on` is the surface contract — a ground and its text
 * are one decision rather than two — so a surface without one and a non-surface
 * that grows one both fail to compile, and `on` can only ever name a neutral
 * that exists.
 */
type NeutralEntry<Id extends NeutralId> = Id extends SurfaceId
  ? { readonly name: string; readonly hex: Hex; readonly on: NeutralId }
  : { readonly name: string; readonly hex: Hex };

/** The ground, the ink on it, and the greys between. */
export const NEUTRALS = {
  /**
   * The page. A soft near-black rather than pure black, which is harsh under a
   * full screen of type and reads as a hole rather than as a surface.
   *
   * Reach for it for the page and for anything meant to read as the page: a
   * full-bleed section, a sheet that fills the viewport. Never as a lift on top
   * of another surface — it is the floor, and a patch of floor inside a card
   * reads as a hole punched through it. It is also the ink every act and
   * family fill carries, which is what its darkness is for.
   */
  background: { name: "Ground", hex: "#121212", on: "foreground" },
  /**
   * Primary text. Not pure white: one step down, so a full page of body copy
   * does not glare against the near-black ground.
   *
   * Reach for it for body copy, headings and anything the reader is meant to
   * actually read. Never as a fill or an edge: a near-white block is the
   * loudest thing a dark page can show, and it takes the eye off whatever the
   * page wanted pressed.
   */
  foreground: { name: "Ink", hex: "#EDEDED" },
  /**
   * **Depth: a thing on the page.** Section backgrounds and cards — the first
   * lift off the page, and the surface most of a dashboard is built from.
   *
   * Reach for it whenever content has to read as a block with an inside and an
   * outside. It is authored rather than transient, so never for a hover or a
   * selection: a row that climbs to card height under the pointer announces a
   * new surface every time the cursor crosses it.
   */
  card: { name: "Card", hex: "#1A1A1A", on: "foreground" },
  /**
   * **The ground a thing takes when it is set back from its neighbours**: a
   * skeleton's bars while a list loads, an unselected filter pill, a read-only
   * field, an inset panel, a quoted reply, a tile behind a glyph. It is
   * authored and it is static — a page renders it and it stays.
   *
   * **It is a surface, and hover is a layer.** They are different constructs
   * and this grey is not the hover one: `HOVER` in `surfaces.ts` is the ink at
   * a low alpha, laid over whatever ground an element is already on, so a row
   * on the page, on a card and on a lifted panel each lift one visible step
   * from where they are. Which means a static panel may be lifted *and* the
   * rows on it still hover, and neither statement gets in the other's way. A
   * grey written as a hover is the defect: it lifts a row on the page and does
   * nothing at all to a row already on this one.
   *
   * **A selection is neither.** A state that has to survive the pointer leaving
   * takes a mark rather than a fill: the brand's own act colour on a leading
   * edge, a check, or a filled chip. A ground alone cannot say *chosen*, and
   * pretending it can is what the deleted fourth step used to be for.
   *
   * **Disabled is opacity, never this grey.** A disabled control keeps its
   * ground and loses its ink; a quiet block keeps its ink and changes ground.
   * Drawing both with one fill makes an unavailable thing and a de-emphasised
   * thing look identical, which is the one confusion a grey ladder must not
   * introduce.
   *
   * It is the lightest ground the library ships, which makes it the one every
   * text pairing is bound by: a colour that clears its threshold here clears it
   * on all three grounds.
   *
   * Its ink is `foreground`, like every other ground here — `mutedForeground`
   * below is *not* this token's companion, so no `lifted-foreground` is
   * generated.
   *
   * Never under the reading column a page exists to show. Setting back the
   * thing the reader came for is a contradiction the eye notices before the
   * mind does.
   */
  lifted: { name: "Lifted", hex: "#262626", on: "foreground" },
  /**
   * **The quiet ink**: captions, metadata, the line under a title.
   *
   * Reach for it for what accompanies the sentence, never for the sentence
   * itself — a surface whose main line is set in it is a surface asking to be
   * skipped. It is measured only against the three neutral grounds, so it is
   * never text on a brand or family fill; those fills carry their own ink.
   *
   * **It is ink, and it is not the companion of any ground.** Its name is a
   * historical accident of a deleted grey; nothing is authored *on* it and no
   * surface names it as its `on`. It reads on every ground the theme ships,
   * which is the whole of what it is for.
   */
  mutedForeground: { name: "Quiet ink", hex: "#A6A6A6" },
  /**
   * Borders and dividers. Furniture edges are neutral; colour arrives on an
   * edge only where the border is the construct.
   *
   * Reach for it for any edge that is furniture: a card's outline, a divider, a
   * field's rest state. Never as text and never as a fill — at this value it is
   * an edge and nothing else, and a block of it is a dead grey panel a reader
   * cannot place.
   *
   * It is the **rest** value of an edge that also carries a state. Where a
   * thing takes its edge up under the pointer it goes to `foreground`; where it
   * is chosen, the edge goes to `act`. Both start here, which is why an edge
   * that will ever move is drawn at this value from the beginning rather than
   * added when the state arrives — an edge that appears on hover is two pixels
   * of layout landing under the cursor.
   */
  border: { name: "Border", hex: "#333333" },
} as const satisfies { readonly [Id in NeutralId]: NeutralEntry<Id> };

// ------------------------------------------------------------- brand pair

/**
 * The two signature colours and the ink each one carries.
 *
 * **Each is named for what it means, never for its rank.** `act` is the colour
 * of the thing to do; `world` is the colour of Sogverse itself. Neither is the
 * other's junior, and a rank name is what this pair is decided against: it
 * makes the loudest colour the brand owns read as the low-emphasis option, and
 * it hands a component an emphasis tier where it should be taking a meaning. A
 * name carries the rule with it — the act colour wins the main action, and the
 * world colour is never the quiet one — so a use that contradicts the rule is
 * a use that contradicts the name, and reads wrong before it is measured.
 *
 * A fill and its foreground are one decision, not two: act is a light colour
 * and only a dark label reads on it, world is a dark colour and only a light
 * label reads on it. A button that swaps its fill and keeps its label has not
 * changed colour, it has broken.
 */
export const BRAND = {
  /**
   * **Act.** The colour of the thing to do.
   *
   * The signature colour, and the one most associated with School of Gaming:
   * the logo badge, the main call to action, the highlights and the moments
   * meant to feel like us. Act always wins the main action.
   *
   * Never twice on one screen: two amber calls to action make neither of them
   * the one to press, and the colour's whole value is that a reader does not
   * have to look for the answer. Never body copy or a small link — it is a fill
   * and a mark, and a paragraph set in it spends the palette's one *press this*
   * signal on prose. Never recoloured, gradiented or stepped down with alpha;
   * it is the mark's own colour and it exists at this value or not at all.
   */
  act: { name: "Amber", hex: "#FAA901", foreground: "#121212" },
  /**
   * **World.** The colour of Sogverse itself.
   *
   * The energy colour, the force that powers Sogverse. Launches, big news,
   * anything electric. It carries lore, display and identity, and nothing else:
   * it is never the colour of quiet, safety or trust-building copy written for
   * a parent, where its loudness promises excitement about the one subject that
   * has to read as steady.
   *
   * World sets the tone of Sogverse and is never the quiet option — it is the
   * loudest colour the brand owns, and a surface that reaches for it to
   * de-emphasise something gets the opposite of what it asked for. Never the
   * main call to action either — that is act's everywhere, and a violet button
   * on a page with an act one asks the reader to guess. Never a fifth element
   * colour: the four relationships below are spoken for, and a hue that also
   * codes a value stops being the world's colour.
   */
  world: { name: "Violet", hex: "#8F00E2", foreground: "#FFFFFF" },
} as const satisfies Record<
  string,
  { name: string; hex: Hex; foreground: Hex }
>;

export type BrandId = keyof typeof BRAND;

// ---------------------------------------------------------- Yty families

/**
 * The four Yty-Element colours, one apiece.
 *
 * A family says which of the four relationships a piece serves, and that is the
 * whole of its job. So a family **accents** — a fill under an ink label, an
 * edge, a ring, an unlabelled mark, a glyph, a label — and never grounds a long
 * passage of text, where the cue stops being read as a cue and becomes the
 * conditions the reader is reading in.
 *
 * **One colour, every role.** There is no second value to choose between, and
 * that is the point: a family is a meaning, and a meaning with two colours is a
 * decision handed to every call site that spends it. The same hex fills, edges,
 * rings, marks, inks and draws.
 *
 * **Coloured text is a label.** A family's hex is set as type only on the name
 * of a value — "Glow", "Wit" — beside a glyph in the same hue, on a neutral
 * ground. Never a sentence, never a heading a reader reads through, never on a
 * coloured ground. And whichever role a piece takes it carries a glyph and a
 * label, because the colour is never the only copy of the meaning.
 *
 * **The brand fixes two values per family and this theme ships one.** The pair
 * is authored for a white page. Each entry records the value that is not
 * emitted, so nothing is lost by leaving it out of the stylesheet. Three
 * families take the brand's own lighter value unchanged; Valor is the one
 * departure on a hue this theme makes, declared in its own entry.
 */
export const YTY_FAMILIES = {
  /**
   * **People.**
   *
   * The relationship with yourself: balance, emotional control, rest. Reach for
   * it for community, friendship and testimonials.
   *
   * Never as a pink that is merely wanted. A piece that is not about knowing
   * yourself and the people around you takes another family or none, because
   * every decorative use of it costs a real one its meaning.
   *
   * As type it appears only on the element's own name beside its mark. The
   * brand's other value is `#F55B9A`, its white-ground half, not emitted: pink
   * lightens with its chroma intact, so the lighter value carries every role
   * here and the darker one carries none.
   */
  harmony: { name: "Harmony", hue: "Pink", hex: "#FA7FA3" },
  /**
   * **Growth.**
   *
   * The relationship with others: empathy, kindness, belonging. Reach for it
   * for growth, milestones and progress.
   *
   * **It is also the colour of success**, and that is a decision rather than a
   * slip: a status is a fact and a fact takes a family, so `STATUS` below points
   * at this entry rather than carrying a green of its own. A second green tuned
   * to sit beside this one was drawn and refused — two near shades of one hue on
   * a page teach a reader that neither of them means anything, where one hue
   * carrying two related meanings is survivable, because the glyph and the label
   * carry the difference everywhere the library colour-codes anything.
   *
   * As type it appears only on a label — an element's name, a state's name —
   * beside a glyph in the same green. The brand's other value is `#1AB061`, its
   * white-ground half, not emitted.
   */
  glow: { name: "Glow", hue: "Green", hex: "#6AC66B" },
  /**
   * **Adventure.**
   *
   * The relationship with society: teamwork, innovation, civic courage. Reach
   * for it for challenges, camps and courage.
   *
   * Never as a warning, and never in act's place. It sits close enough to the
   * signature colour that a page spending both without a reason reads as one
   * colour rendered twice, and close enough to a caution hue that a warning
   * drawn in it claims a value is being reported.
   *
   * **Declared departure: Valor's orange on the dark ground, derived from the
   * brand's pair.** The brand authors `#FD700D` and `#FF993D`, both tuned for a
   * white page, and on `#121212` neither is this family's colour: the darker
   * value reads as ink that has gone dark, and the lighter one reads as a peach.
   * The reason is the hue. **Orange loses its chroma when it is lightened, where
   * pink, green and blue do not** — the sRGB gamut is at its widest for orange
   * right about where the darker value already sits, so every step toward the
   * lighter one is a step the colour cannot take without giving up saturation,
   * which is what a peach is. The value below is OKLCH `L 0.757, C 0.168,
   * h 55°`: nearly the lighter value's lightness, carrying the most chroma sRGB
   * allows there, which is exactly what the lighter value gave away. Both
   * authored values are recorded here and neither is emitted. The departure is
   * on the value and never on the shape — Valor is one colour in every role,
   * like the other three.
   */
  valor: { name: "Valor", hue: "Orange", hex: "#FF8F31" },
  /**
   * **Knowledge.**
   *
   * The relationship with technology: critical thinking, media literacy. Reach
   * for it for learning, tips and how-to.
   *
   * Never as a link colour. Blue arrives with a lifetime of interface meaning
   * attached, and letting wit carry any of it turns the one family about
   * thinking into chrome. **It is the colour of info**, on the same reasoning
   * that makes Glow the colour of success: a status is a fact and a fact takes a
   * family, and a second blue beside this one would be two shades of one hue
   * doing two jobs the glyph and the label already tell apart.
   *
   * As type it appears only on a label beside a glyph in the same blue. The
   * brand's other value is `#3A71DE`, its white-ground half, not emitted — it
   * clears the glyph floor on these grounds and the body floor on none of them,
   * so it could never have carried the label anyway.
   */
  wit: { name: "Wit", hue: "Blue", hex: "#4DB3F5" },
} as const satisfies Record<string, { name: string; hue: string; hex: Hex }>;

export type YtyFamilyId = keyof typeof YTY_FAMILIES;

// ---------------------------------------------------------------- status

/** The four things the product reports about itself. */
export type StatusId = "destructive" | "success" | "info" | "warning";

/**
 * A status either owns a hue or takes a family's, and never both.
 *
 * The union is the grammar made unwriteable-wrong: an entry naming a family
 * cannot also spell a hex, so a status that borrows a meaning cannot drift into
 * a near neighbour of the colour it borrowed. `statusHex` is the only way to
 * read the colour out, so nothing downstream has to know which of the two kinds
 * it is holding.
 */
export type StatusEntry =
  | { readonly name: string; readonly hex: Hex }
  | { readonly name: string; readonly family: YtyFamilyId };

/**
 * The four status colours.
 *
 * **A status is a fact, and a fact takes a family — where a family means it.**
 * That is the tone grammar's own sentence (`grammar.ts`), and two of the four
 * rows below are exactly that: success is Glow and info is Wit, pointing at the
 * family entry rather than carrying a value. Retuning Glow moves success with
 * it, and no arithmetic anywhere can leave the two as near neighbours. The rows
 * live here rather than beside the product kinds because two of the four are
 * hues in their own right, and splitting one table so that half of it sat in the
 * colour source and half in the grammar would put two rows in each file.
 *
 * **Why success and info are not their own colours.** Retuned near-duplicates
 * were drawn and refused: a fresh blue beside Wit reads as two shades of blue on
 * one page, a fresh green beside Glow as two greens, and a reader who meets two
 * near-identical hues learns that neither of them means anything. One hue
 * carrying two related meanings is the cheaper trade, because the glyph and the
 * label already carry the difference everywhere the library colour-codes
 * anything.
 *
 * **Why destructive and warning are their own colours.** Red is the one status
 * hue with room — Valor's orange is 25° away and Harmony's pink 18°, and red
 * reads as neither — so it is free to be a colour of its own. Warning is the
 * opposite case: it was act's near twin, which made a caution badge
 * and a call to action the same colour, and moving it off the gold is what makes
 * a warning and *press this* two different things on one screen. Neither hue
 * codes a Yty value, so neither takes a family.
 *
 * **Error and warning stay two colours.** They are far enough from each other
 * and from everything else in the palette that merging them would only cost the
 * distinction a reader already reads.
 *
 * **Coloured text is a label here too.** A status hex is set as type on the name
 * of a state — "Payment failed", "Past due", "Waitlisted" — beside a glyph in
 * the same hue, on a neutral ground. An error *sentence* is ink with the mark
 * beside it carrying the colour: a parent reading a sentence about their child's
 * seat is being talked to, and this is not the register to talk to them in.
 */
export const STATUS = {
  /**
   * Something failed, or is about to be destroyed.
   *
   * Its own hue, neither the brand's nor a family's. Tuned to this ground: a red
   * that clears the body floor as a label on all three grounds and carries dark
   * ink where it is filled.
   */
  destructive: { name: "Destructive", hex: "#FF5C5C" },
  /**
   * Something worked.
   *
   * Glow's green, whole. The family entry carries the reason this is not a green
   * of its own.
   */
  success: { name: "Success", family: "glow" },
  /**
   * Something a reader needs to know and did not ask about.
   *
   * Wit's blue, whole. The family entry carries the reason this is not a blue of
   * its own.
   */
  info: { name: "Info", family: "wit" },
  /**
   * Something needs attention before it becomes a failure.
   *
   * Its own hue, and deliberately **not** act: act is the colour
   * of the thing to do, and a warning drawn in it makes a caution and a call to
   * action indistinguishable on the one screen where telling them apart matters.
   * A caution yellow at a lower saturation reads as caution and reads as not the
   * brand; going further lands in chartreuse and stops reading as caution at
   * all.
   */
  warning: { name: "Warning", hex: "#DFCB25" },
} as const satisfies Record<StatusId, StatusEntry>;

/** The four in the order the palette declares them. */
export const STATUS_IDS = [
  "destructive",
  "success",
  "info",
  "warning",
] as const satisfies readonly StatusId[];

/**
 * The colour a status draws in, whichever kind of entry it is.
 *
 * The one reader of the union, so no consumer — the generator, the ledger, an
 * email, a canvas — ever branches on whether a status owns its hue or borrows
 * one. That is what makes `success` and Glow the same value by construction
 * rather than by two literals that happen to agree today.
 */
export function statusHex(id: StatusId): Hex {
  const entry: StatusEntry = STATUS[id];
  return "hex" in entry ? entry.hex : YTY_FAMILIES[entry.family].hex;
}

/**
 * The label every status fill carries.
 *
 * One value for all four, and it is measured rather than chosen: against dark
 * ink the four fills clear the body floor with room to spare, and against white
 * not one of them clears it. So no white survives anywhere in the status set,
 * and a `-foreground` companion is generated for each so that a consumer's
 * `text-<status>-foreground` keeps naming a decision instead of a hard-coded
 * grey. It is the page ground doing its other job — the same hex reads as the
 * surface a page is built from and as the ink a bright fill carries — which is
 * what lets one measurement settle both uses. `contrast.ts` holds the proof.
 */
export const STATUS_INK: Hex = NEUTRALS.background.hex;

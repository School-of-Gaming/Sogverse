/**
 * The brand's colours, defined once.
 *
 * This is the foundations tier's single typed source of truth for colour, and
 * the only file in the package that spells a hex. `theme.css` beside it is
 * generated from here (`npm run tokens --workspace=@sog/ui`), so a value moves
 * in one place; anything that cannot read CSS — an email, a canvas, an OG image
 * — imports these constants instead.
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
 * **A surface written for parents, partners, safety or billing takes amber as
 * its single accent**, on neutral grounds with grey for support. A second
 * palette family enters only with intent, and never as decoration. Calm
 * surfaces are what carry credibility: a parent deciding whether to hand us a
 * child reads the restraint before they read a word of the copy, and a page
 * awash in six vivid hues undercuts the steady register the brand speaks in
 * everywhere else — it makes the page look like it is selling to the child
 * rather than answering the adult.
 *
 * *Open: whether these surfaces may instead spend colour wherever a mark has a
 * job — a state, a date, a name — with only decorative colour kept out, is a
 * question for the owner. Until it is ruled, the single-accent budget above is
 * what the library holds.*
 *
 * **A surface telling a story to a mixed audience takes amber plus one
 * family.** Two accents at most. The second colour is there to give the story a
 * subject; a third makes the palette itself the subject.
 *
 * **A surface built for gamers, the community, the shop or the world itself
 * takes the full palette.** That is where the loudness belongs. These readers
 * came for the world, the palette is the world's, and restraint here reads as a
 * duller product than the one we actually run.
 *
 * ## The rules that hold everywhere
 *
 * - **Amber wins the primary call to action** and the moments meant to feel
 *   like us. It is the colour most associated with School of Gaming, so one
 *   amber thing on a screen is read as the thing to do — and two make neither
 *   of them it.
 * - **Violet sets the tone of the world**: launches, big news, lore, display
 *   and identity, the electric and high-energy moments. It is never the colour
 *   of quiet, safety or trust-building copy addressed to a parent, because it
 *   is loud exactly where that copy has to be steady, and excitement is the
 *   wrong promise to make about a child's safety.
 * - **A family accents content; it is never the ground under a long passage of
 *   text.** A family's job is to say which relationship a piece serves, and a
 *   hue spread under a paragraph stops being a signal and becomes the
 *   conditions the reader is reading in.
 * - **Never all six colours on one page.** Amber plus one supporting family is
 *   the default. Six hues in one frame is not a code a reader can decode; it is
 *   noise wearing brand colours.
 * - **Colour-coding follows the value a piece serves**, wherever colour codes
 *   anything: harmony for community, friendship and testimonials; glow for
 *   growth, milestones and progress; valor for challenges, camps and courage;
 *   wit for learning, tips and how-to; violet for launches and announcements;
 *   amber for general brand and calls to action. A club page carries its
 *   dominant element's colour as a cue on the same mapping. One mapping
 *   everywhere is the only thing that makes the cue legible: a hue meaning one
 *   thing on a card and another in a feed means nothing in either.
 * - **Meaning never travels by hue alone.** A colour-coded element also carries
 *   a glyph and a label, because a meaningful share of gamers are colourblind,
 *   and a cue they cannot see is a cue that is not there.
 * - **Text is ink or white, never coloured text on a coloured ground**, and
 *   never at a ratio nobody measured. The library offers one thing beyond that:
 *   a family's soft variant as text on a neutral ground, measured on every
 *   ground it can land on. *Open: whether a neutral ground keeps that inside
 *   the rule, or makes it a departure needing the owner's ruling, is not
 *   settled here.*
 * - **A brand colour exists at exactly the values authored below, never at an
 *   alpha step**: over a near-black ground an alpha step composites to a
 *   darker, duller hue, so what the reader sees is no longer the brand. A
 *   ground that needs to lift goes to a neutral.
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
 * `#1A1A1A`, the hover fill `#212121`, the de-emphasised ground `#262626`,
 * muted ink `#A6A6A6` and border `#333333` are not derived from light values
 * and have no light counterparts to be derived from — a light palette has a
 * page, a card tint, a divider grey and a secondary-text grey, and none of them
 * is one of these. Two of them are the light palette's own ends put to
 * different work: the ground is the brand's ink, used as a surface, and the ink
 * is one step down from white so a full page of body copy does not glare back.
 * The rest are the ladder that a dark page needs and a light one does not.
 *
 * **Amber keeps its intent and loses its arithmetic.** On a light ground amber
 * misses the body floor by a wide margin, which is why it is a fill and a
 * large-graphic colour there and never body copy or a small link. On this
 * ground it clears that floor easily, and it is still not body copy: amber is a
 * fill and a mark. It is the one colour on the screen that says *press this*,
 * and a paragraph set in it spends that signal on a paragraph. So the
 * restriction stands here for the reason the brand holds it, rather than for
 * the measurement that used to enforce it.
 *
 * **Strong and soft swap roles.** On a light ground the soft variants are
 * decorative and not text-safe. On these grounds soft is the text-safe half and
 * strong is the fill, the edge and the ring — strong fills, borders, rings and
 * glows; soft carries text and glyphs. That is a measured result rather than a
 * preference, and it is the whole reason the split is a rule instead of a
 * habit. `contrast.ts` holds every pairing the library ships and the floor each
 * one is held to.
 *
 * **Every text-on-ground pairing is re-proven on these grounds.** Nothing is
 * inherited from the light reading, including the pairings that would have been
 * safe there: each is measured again against the four grounds this theme
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
  | "accent"
  | "muted"
  | "mutedForeground"
  | "border";

/**
 * The neutrals a component **fills** — a ground with text on it — and so the
 * exact set that carries an `on`.
 *
 * Four, and together they are the whole ladder a dark page climbs: the page
 * itself, the lift a card takes off it, and two smaller lifts above the card —
 * the fill a row takes under the pointer, and the ground a de-emphasised block
 * sits on. Everything else in the set is ink or an edge, and neither is filled.
 */
type SurfaceId = "background" | "card" | "accent" | "muted";

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
   * reads as a hole punched through it. It is also the ink every amber and
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
   * Section backgrounds and cards — the first lift off the page, and the
   * surface most of a dashboard is built from.
   *
   * Reach for it whenever content has to read as a block with an inside and an
   * outside. Never for a hover or a selection: those are transient, and a row
   * that climbs to card height under the pointer announces a new surface every
   * time the cursor crosses it.
   */
  card: { name: "Card", hex: "#1A1A1A", on: "foreground" },
  /**
   * The fill a row, a menu option or a ghost button takes **under the
   * pointer**. The smallest lift the theme ships, on purpose: a hover has to
   * read as a change of state, not as a new surface arriving. It is transient
   * and never the ground a block of content is authored on — that is the card.
   *
   * Never the only mark of a selected state either. A lift this small is a hint
   * the pointer takes with it when it leaves, and a selection has to survive
   * the pointer leaving.
   */
  accent: { name: "Accent", hex: "#212121", on: "foreground" },
  /**
   * The ground under a **de-emphasised block**: a skeleton's bars while a list
   * loads, an unselected filter pill, an inset panel that has to sit back from
   * the content around it.
   *
   * It is the lightest ground the library ships, which makes it the one every
   * text pairing is bound by: a colour that clears its threshold here clears it
   * on all four grounds.
   *
   * Its ink is `foreground`, like every other ground here — `mutedForeground`
   * below is *not* this token's companion. That one is secondary text, which
   * reads on every ground rather than on this one, so no `muted-foreground`
   * companion is generated for `muted`.
   *
   * Never under the reading column a page exists to show. This is the ground
   * that sets content back, and setting back the thing the reader came for is a
   * contradiction the eye notices before the mind does.
   */
  muted: { name: "Muted", hex: "#262626", on: "foreground" },
  /**
   * Secondary text: captions, metadata, the line under a title.
   *
   * Reach for it for what accompanies the sentence, never for the sentence
   * itself — a surface whose main line is set in it is a surface asking to be
   * skipped. It is measured only against the four neutral grounds, so it is
   * never text on a brand or family fill; those fills carry their own ink.
   */
  mutedForeground: { name: "Muted ink", hex: "#A6A6A6" },
  /**
   * Borders and dividers. Furniture edges are neutral; colour arrives on an
   * edge only where the border is the construct.
   *
   * Reach for it for any edge that is furniture: a card's outline, a divider, a
   * field's rest state. Never as text and never as a fill — at this value it is
   * an edge and nothing else, and a block of it is a dead grey panel a reader
   * cannot place.
   */
  border: { name: "Border", hex: "#333333" },
} as const satisfies { readonly [Id in NeutralId]: NeutralEntry<Id> };

// ------------------------------------------------------------- brand pair

/**
 * The two signature colours and the ink each one carries.
 *
 * A fill and its foreground are one decision, not two: amber is a light colour
 * and only a dark label reads on it, violet is a dark colour and only a light
 * label reads on it. A button that swaps its fill and keeps its label has not
 * changed colour, it has broken.
 */
export const BRAND = {
  /**
   * **Act.**
   *
   * The signature colour, and the one most associated with School of Gaming:
   * the logo badge, the primary call to action, the highlights and the moments
   * meant to feel like us. Amber always wins the main action.
   *
   * Never twice on one screen: two amber calls to action make neither of them
   * the one to press, and the colour's whole value is that a reader does not
   * have to look for the answer. Never body copy or a small link — it is a fill
   * and a mark, and a paragraph set in it spends the palette's one *press this*
   * signal on prose. Never recoloured, gradiented or stepped down with alpha;
   * it is the mark's own colour and it exists at this value or not at all.
   */
  primary: { name: "Amber", hex: "#FAA901", foreground: "#121212" },
  /**
   * **World.**
   *
   * The energy colour, the force that powers Sogverse. Launches, big news,
   * anything electric. It carries lore, display and identity, and nothing else:
   * it is never the colour of quiet, safety or trust-building copy written for
   * a parent, where its loudness promises excitement about the one subject that
   * has to read as steady.
   *
   * Never the primary call to action — that is amber's everywhere, and a violet
   * button on a page with an amber one asks the reader to guess. Never a fifth
   * element colour either: the four relationships below are spoken for, and a
   * hue that also codes a value stops being the world's colour.
   */
  secondary: { name: "Violet", hex: "#8F00E2", foreground: "#FFFFFF" },
} as const satisfies Record<
  string,
  { name: string; hex: Hex; foreground: Hex }
>;

export type BrandId = keyof typeof BRAND;

// ---------------------------------------------------------- Yty families

/**
 * The four Yty-Element colours, as the strong/soft pairs the brand fixes.
 *
 * Which variant a use reaches for is settled by measurement, not taste:
 * **strong fills, borders, rings and glows; soft carries text and glyphs.**
 * Wit is what makes that a rule rather than a habit — wit-strong clears the
 * glyph floor on both grounds and the body floor on neither — so wit's text and
 * ink always take soft, and the same recipe then holds for the other three so
 * that one rule covers the set. See `contrast.ts`.
 *
 * A family says which of the four relationships a piece serves, and that is the
 * whole of its job. So a family accents — a badge, an edge, a glyph, a fill
 * behind a short label — and never grounds a long passage of text, where the
 * cue stops being read as a cue and becomes the conditions the reader is
 * reading in. And a family is never a status: green here is the relationship
 * with others, not success, and a hue that also means *this worked* means
 * nothing in either job. Whichever a piece takes, it carries a glyph and a
 * label beside it, because the colour is never the only copy of the meaning.
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
   */
  harmony: { name: "Harmony", hue: "Pink", strong: "#F55B9A", soft: "#FA7FA3" },
  /**
   * **Growth.**
   *
   * The relationship with others: empathy, kindness, belonging. Reach for it
   * for growth, milestones and progress.
   *
   * Never as the colour of success, saved, healthy or online. Green is the
   * loudest false friend in the set, and a status borrowing it teaches a reader
   * that this hue reports the system rather than naming a value.
   */
  glow: { name: "Glow", hue: "Green", strong: "#1AB061", soft: "#6AC66B" },
  /**
   * **Adventure.**
   *
   * The relationship with society: teamwork, innovation, civic courage. Reach
   * for it for challenges, camps and courage.
   *
   * Never as a warning, and never in amber's place. It sits close enough to the
   * signature colour that a page spending both without a reason reads as one
   * colour rendered twice, and close enough to a caution hue that a warning
   * drawn in it claims a value is being reported.
   */
  valor: { name: "Valor", hue: "Orange", strong: "#FD700D", soft: "#FF993D" },
  /**
   * **Knowledge.**
   *
   * The relationship with technology: critical thinking, media literacy. Reach
   * for it for learning, tips and how-to.
   *
   * Never as a link colour or an informational blue. Blue arrives with a
   * lifetime of interface meaning attached, and letting wit carry any of it
   * turns the one family about thinking into chrome. Its strong variant is
   * never text either: it clears the glyph floor and not the body floor, so
   * text and ink take soft.
   */
  wit: { name: "Wit", hue: "Blue", strong: "#3A71DE", soft: "#4DB3F5" },
} as const satisfies Record<
  string,
  { name: string; hue: string; strong: Hex; soft: Hex }
>;

export type YtyFamilyId = keyof typeof YTY_FAMILIES;

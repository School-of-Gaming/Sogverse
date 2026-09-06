/**
 * Question 8 — gradients.
 *
 * A gradient is a colour construct the library has no word for, and every one
 * of them in Sogverse spends the signature pair. The act/world ruling binds
 * them: no gradient may carry act or world at an alpha step, and every gradient
 * below except one does exactly that. So the question is not whether the alpha
 * goes — it goes — but what a hero, a card and a chip look like instead.
 *
 * **Regenerate the surface:**
 *
 *     grep -rnE "bg-gradient-to|linear-gradient|GRADIENT\." src --include=*.tsx --include=*.ts
 *
 * **One recipe, four places, two spellings.** The hero wash exists in
 * `app/(public)/page.tsx` and `roblox/roblox-hero.tsx` as a raw CSS
 * `linear-gradient` built with `color-mix` — act at 20% and world at 10% under
 * a vertical fade to the ground — and again in the two OG images and the email
 * layout, built from `GRADIENT.actGlow` / `worldGlow`, which are the same two
 * colours **already composited to opaque hexes** because neither a satori
 * render nor an email client can be trusted with alpha. Two implementations of
 * one recipe, in four files, that can drift apart without anything failing.
 *
 * **And the composited pair is the ruling's hardest case.** `GRADIENT.actGlow`
 * is act at 20% over the ground, flattened: the same pixel the app paints, in a
 * solid's clothes. It is a brand colour at an alpha step wherever it lands, so
 * the act/world ruling reaches it — while the doc comment on
 * `packages/sog-ui/src/tokens/composite.ts` currently says the opposite in as
 * many words ("a composited value is not a new brand colour … the rule that a
 * brand colour exists only at its authored values is unaffected"). Both cannot
 * stand. `composite.ts` is untouched here, deliberately: the contradiction is
 * ledgered under §14 and resolved by whatever this section is ruled, because a
 * helper's doc comment is not the place to decide a colour rule.
 *
 * ---
 *
 * **The owner's three ideas (2026-09-06, evening), in the owner's words.**
 * (1) "We shouldn't smear our brand colours" — but a brand colour **may glow**,
 * the way a voice zone does. (2) The home page, the Roblox page and the OG
 * images "should be colourful": the brand is colourful, vibrant and fun, and a
 * first impression should say so. (3) The temptation is to "blast every
 * colour", and the brand has a rule against it.
 *
 * **The brand's level rule, as the ledger has it.** L0/L1 (public, parents):
 * amber as a single accent. L2 (families, a mixed audience): amber plus one
 * palette family, two accents maximum. L3 (gamers, community, store, in-world):
 * the full palette, "this is where the loudness belongs". And across all of
 * them: "never use all six colours on one page; amber plus one supporting
 * colour is the default". Violet "sets the tone of the Sogverse world … never
 * for quiet, safety-focused or trust-building parent content".
 *
 * The home page is a parent surface, so its answer is **colourful by
 * saturation, not by count**: amber at full strength plus one bold colour on a
 * calm ground, with the mark. Violet is the one to pair with amber for a brand
 * moment — a hero and a social card are exactly the display, launch-shaped
 * placement violet is for, and neither is quiet safety copy. The blast belongs
 * on the gamer surfaces and the shop, which is a later pass.
 *
 * **Glow versus wash — three constraints, and every column below is drawn to
 * them.** A glow has (1) a source at full value, (2) soft edges that come from
 * a blur rather than from an authored alpha, and (3) one hue, on a neutral
 * ground. A wash has no source, mixes two hues, and starts translucent. The
 * zone glow is the accepted shape: `box-shadow: inset 0 0 1.25rem -0.25rem` in
 * the zone's own colour at full value. Every glow drawn here is that shape,
 * outset and larger: a real element at full value, one hue, a blur radius, and
 * nothing else. There is no `color-mix`, no `/n` and no gradient in any
 * candidate column of the hero — the only gradients left on this page are the
 * two `today` columns and the OG card's pre-blurred glow, whose reason is
 * below.
 *
 * **What lands if the owner picks column 2 (full value, no glow).** The two
 * heroes and the two OG images lose the wash and take the ground alone with
 * full-value figures; the About washes and the closing-card tints go; the gedu
 * chip's act→world fill goes to one colour; the mail's header pair follows the
 * OG card, because it is the same recipe at a different fade stop. The library
 * gains no new construct, and `composite.ts`'s doc comment is rewritten the
 * other way: a composited value **is** the brand colour at an alpha step, the
 * act/world rule reaches it, and the composited glow constants are deleted
 * rather than kept for a caller that no longer exists.
 *
 * **What lands if the owner picks column 3 (full value, glowing).** All of the
 * above, plus one library construct: a glow, defined by the three constraints,
 * the only place a brand colour is allowed a soft edge. It takes a hue and a
 * size and is spent from a real element, never from an empty box, and it is the
 * only answer to "make this surface colourful" that does not reopen the alpha
 * question. Sogverse then spends it on the mark and on one violet figure per
 * surface, and nothing else composites.
 *
 * **The OG card cannot carry a CSS blur.** `next/og` renders through satori,
 * which has no blur filter and no box-shadow, so the card's glow — if a glow is
 * what is ruled — is rendered pre-blurred: a radial from a full-value core out
 * to the ground, in one hue, drawn from behind the element that emits it. That
 * is a glow by all three constraints, not a wash: it has a source, it is one
 * hue, and it never starts translucent. It is a gradient only in the way a
 * blurred shadow is a gradient — the falloff is the blur. The two radials sit
 * in boxes that do not overlap, so the two hues never meet and never mix.
 *
 * **Sizes.** A gradient is a fact about a large area, so the hero candidates
 * are stacked at full page width with the app's real headline and copy over
 * them, and the card is drawn as the 1200×630 composition at the size a link
 * preview shows. A wash judged in a swatch is not judged.
 *
 * **What this section stopped drawing, and why.** The Roblox hero is the home
 * hero byte for byte, and the Roblox OG card is the home card's recipe with
 * different words and two partner marks — so both are ruled by the home
 * drawings, exactly as the mail's header already is, and neither is drawn a
 * second time. (That also retires the neutral bars this file used to stand in
 * for the Roblox and Lynx marks: a mark is approved per placement, and the
 * cleanest way not to place one is not to need it.) The five-candidate rows are
 * gone too: the neutral-gradient candidate was a wash with the colour taken out
 * and answers none of the three ideas, and the two-hue full-value wash is what
 * the "we shouldn't smear our brand colours" ruling forbids outright. What is
 * left in every case is today beside what the ledger names.
 *
 * **The faces are not this branch's.** Sogverse sets both heroes in its
 * `--font-display`, which is out of scope until the faces adoption, so the
 * headlines below are set in the library's own h1 step. What is being ruled on
 * is what is behind the words.
 */

import Image from "next/image";
import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import { composite } from "../../../src/tokens/composite";
import { tailwindAlpha } from "./colour";
import {
  Case,
  Compare,
  Exemplar,
  GROUND,
  Panel,
  Question,
} from "./parts";

/** Sogverse's `info`, which is question 2's and is not a library token. */
const INFO = "#308CE8";

const ACT = BRAND.act.hex;
const WORLD = BRAND.world.hex;
const MUTED_INK = NEUTRALS.mutedForeground.hex;
const INK = NEUTRALS.foreground.hex;

/**
 * The two glows the OG image and the mail actually spend, computed here the way
 * `src/lib/constants/colors.ts` computes them, so the card below is painted
 * with the same two hexes the PNG is.
 */
const ACT_GLOW = composite(BRAND.act.hex, 0.2, NEUTRALS.background.hex);
const WORLD_GLOW = composite(BRAND.world.hex, 0.1, NEUTRALS.background.hex);

/** The mark, copied into the demo's own static root beside the photographs. */
const MARK = "/ruling-art/sog-logo-full.svg";
const MARK_RATIO = 379 / 207.5;

/**
 * A glow, spelled the way the one glow the brand already accepts is spelled.
 *
 * `.zone-glow` is `box-shadow: inset 0 0 1.25rem -0.25rem var(--glow-color)` —
 * the zone's colour at its authored value, a blur radius, and a negative
 * spread. This is that, outset and larger, and it is the only softness on this
 * page that the act/world ruling permits: the colour written is the full-value
 * hex, and every partially-lit pixel is the browser's blur rather than an alpha
 * step anybody authored. An outer shadow is not painted under its own element,
 * so the halo appears around the source and the source stays at full value —
 * which is the first of the three constraints, made mechanical.
 *
 * It is written as an inline style rather than a class for the reason every
 * other non-token colour on this page is: Tailwind scans source text, and a
 * class assembled from a hex at render time is a class the stylesheet does not
 * contain.
 */
function glow(hex: string, blur: number, spread: number): string {
  return `0 0 ${blur}px ${spread}px ${hex}`;
}

// ------------------------------------------------------------- the hero

/** The home hero's real copy, which is what the composition has to hold. */
const HERO_COPY =
  "Our skilfully designed clubs promote healthy gaming as a hobby, in Minecraft, Roblox, Fortnite and more. Professional Game Educators make every session a playful learning experience where children make new friends, develop their unique talents, and have fun doing what they love.";

/** `app/(public)/page.tsx` ~26, the class verbatim — the underscores are Tailwind's. */
const HERO_WASH =
  "bg-[linear-gradient(to_bottom,_transparent_0%,_var(--color-background)_100%),linear-gradient(to_right,_color-mix(in_oklab,var(--color-act)_20%,transparent),_transparent_50%,_color-mix(in_oklab,var(--color-world)_10%,transparent))]";

const HERO_MARK_HEIGHT = 72;

/**
 * The hero's candidates.
 *
 * **The headline is the same in every column, including today's**, because it
 * is the app's own copy treatment: the vision statement broken across four
 * lines with no full stop, "Screen Time" in act and "Quality Time" in world.
 * That is why "the vision line set in violet" is not drawn as a separate
 * violet element — half of it already is, in production, in every column. What
 * the candidates ask is what violet does *besides* that.
 *
 * **The mark is in the candidates and not in today's**, which is not an
 * oversight: today's hero carries no mark because the sticky header directly
 * above it does, and putting the mark inside the hero is part of what the
 * amber-plus-one composition proposes. It is also what emits the act glow, so
 * the two arrive together or not at all.
 *
 * **Two violet elements, because they read differently.** A `rule` is
 * typographic punctuation inside the composition — a short, thick bar under the
 * headline, colour as a figure. A `band` is architecture at the section's edge —
 * full-bleed, and it does the job the wash's vertical fade was doing, which is
 * to end the hero. A third candidate, a violet block behind the mark, is not
 * drawn: what ground the mark may sit on is the mark's own rule and belongs to
 * the mark adoption, not to a colour ruling.
 *
 * **The glow columns are the same two compositions with the two glows added**,
 * and the geometry is the constraint. The act glow is emitted by the mark,
 * which is itself an act-coloured shape at full value, and the world glow by
 * the violet element. They are sized so their haloes never meet: the mark's
 * fades out roughly 95px below it, the headline is four lines of h1 between
 * them, and the violet element's reaches no more than 80px up. Two hues that
 * never touch cannot mix, which is the whole difference between this and the
 * wash in column one.
 *
 * **`wide` is the line being drawn.** The same two glows, blurred and spread
 * until they meet in the middle of the hero — at which point there is no
 * neutral ground between them, two hues are mixing, and it is today's wash
 * again with extra steps. It is here so the owner can see where a glow stops
 * being a glow rather than take it on trust.
 */
type HeroCandidate = "today" | "rule" | "band" | "ruleGlow" | "bandGlow" | "wide";

type HeroSpec = {
  readonly ground: string;
  readonly mark: boolean;
  readonly violet: "none" | "rule" | "band";
  readonly actGlow?: string;
  readonly worldGlow?: string;
};

const HERO_SPECS: Record<HeroCandidate, HeroSpec> = {
  today: { ground: HERO_WASH, mark: false, violet: "none" },
  rule: { ground: "bg-background", mark: true, violet: "rule" },
  band: { ground: "bg-background", mark: true, violet: "band" },
  ruleGlow: {
    ground: "bg-background",
    mark: true,
    violet: "rule",
    actGlow: glow(ACT, 90, 4),
    worldGlow: glow(WORLD, 70, 0),
  },
  bandGlow: {
    ground: "bg-background",
    mark: true,
    violet: "band",
    actGlow: glow(ACT, 90, 4),
    worldGlow: glow(WORLD, 80, 0),
  },
  wide: {
    ground: "bg-background",
    mark: true,
    violet: "band",
    actGlow: glow(ACT, 320, 60),
    worldGlow: glow(WORLD, 320, 60),
  },
};

/** `app/(public)/page.tsx` — the home hero, and `roblox/roblox-hero.tsx` byte for byte. */
function Hero({ candidate }: { candidate: HeroCandidate }) {
  const spec = HERO_SPECS[candidate];
  return (
    <div className={`relative overflow-hidden rounded-lg ${spec.ground}`}>
      <div className="px-6 py-20 text-center">
        {spec.mark ? (
          <span
            className="mb-10 inline-block"
            style={{ borderRadius: 12, boxShadow: spec.actGlow }}
          >
            <Image
              src={MARK}
              alt=""
              width={Math.round(HERO_MARK_HEIGHT * MARK_RATIO)}
              height={HERO_MARK_HEIGHT}
              className="block"
              unoptimized
            />
          </span>
        ) : null}
        <h4 className="text-h1 tracking-tight">
          Where
          <br />
          <span className="text-act">Screen Time</span>
          <br />
          Becomes
          <br />
          <span className="text-world">Quality Time</span>
        </h4>
        {spec.violet === "rule" ? (
          <span
            className="mx-auto mt-10 block h-[6px] w-56 rounded-full"
            style={{ backgroundColor: WORLD, boxShadow: spec.worldGlow }}
          />
        ) : null}
        <p className="mx-auto mt-8 max-w-3xl text-body-l text-muted-foreground">
          {HERO_COPY}
        </p>
        <div className="mt-10 flex flex-col-reverse items-center justify-center gap-4 sm:flex-row">
          <span className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-5 text-cta shadow-sm">
            Learn more about us
          </span>
          <span className="inline-flex h-11 items-center justify-center rounded-md bg-act px-5 text-cta text-act-foreground shadow">
            Get started
          </span>
        </div>
      </div>
      {spec.violet === "band" ? (
        <span
          className="absolute inset-x-0 bottom-0 block h-[10px]"
          style={{ backgroundColor: WORLD, boxShadow: spec.worldGlow }}
        />
      ) : null}
    </div>
  );
}

// -------------------------------------------------------- the tinted card

/**
 * The closing card, and the About cards below it.
 *
 * The two are one construct at two values — `/10` on the home page's and the
 * programme's call to action, `/5` on the two About cards — and nobody chose 10
 * over 5 on either surface. The ruling that the pair carries no alpha makes the
 * difference moot, so each is drawn once beside what the ledger names for it:
 * the closing card takes the ground alone with a full-value rule, in act or in
 * violet, and the About cards take the ground alone.
 *
 * The rule is drawn in both colours because the card is where the two answers
 * genuinely differ: act on a call to action is the colour of the thing to do
 * and repeats the button below it; violet is the world's colour and says
 * nothing about the button. The owner picks one.
 */
const CARD_GROUNDS = {
  ten: "bg-gradient-to-r from-act/10 to-world/10",
  five: "bg-gradient-to-r from-act/5 to-world/5",
  none: "bg-card",
  ruleAct: "bg-card",
  ruleWorld: "bg-card",
} as const;

type CardGround = keyof typeof CARD_GROUNDS;

const CARD_RULES: Partial<Record<CardGround, string>> = {
  ruleAct: ACT,
  ruleWorld: WORLD,
};

function ClosingCard({
  ground,
  heading,
  body,
}: {
  ground: CardGround;
  heading: string;
  body: string;
}) {
  const rule = CARD_RULES[ground];
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border text-foreground shadow-sm ${CARD_GROUNDS[ground]}`}
    >
      {rule === undefined ? null : (
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ backgroundColor: rule }}
        />
      )}
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <h4 className="text-h4 font-bold">{heading}</h4>
        <p className="mt-3 text-body-s text-muted-foreground">{body}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium shadow-sm">
            Explore clubs
          </span>
          <span className="inline-flex h-10 items-center justify-center rounded-md bg-act px-4 text-sm font-medium text-act-foreground shadow">
            Create an account
          </span>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------- the lit card

/**
 * `family/EnrollmentCard.tsx` and `gedu/GeduAssignmentCard.tsx` — a card lit
 * from its leading edge because something is happening on it.
 *
 * Three sites, two colours: act for a club that is running, info for a purchase
 * whose placement is under way. The pair is not what is spent here — this is a
 * single hue fading to transparent — so this case was already ruled with the
 * tinted-callout sweep, and what is left to see is today beside the leading
 * rule that replaces it. The awaiting card is drawn beside the live one because
 * the two exist to be told apart at a glance in the same list.
 *
 * The act half is written in classes and the info half inline: `info` is
 * question 2's and is not a library token, so there is no `from-info/5` for the
 * stylesheet to contain.
 */
type LitGround = "today" | "rule";

const LIT_ACT: Record<LitGround, string> = {
  today: "bg-gradient-to-r from-act/5 to-transparent",
  rule: "bg-card",
};

const LIT_INFO_IMAGE: Record<LitGround, string | undefined> = {
  today: `linear-gradient(to right, ${tailwindAlpha(INFO, 5)}, transparent)`,
  rule: undefined,
};

function LiveCard({ ground, tone }: { ground: LitGround; tone: "act" | "info" }) {
  const act = tone === "act";
  const classes = act ? LIT_ACT[ground] : "bg-card";
  const backgroundImage = act ? undefined : LIT_INFO_IMAGE[ground];
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border shadow-sm ${classes}`}
      style={backgroundImage === undefined ? undefined : { backgroundImage }}
    >
      {ground === "rule" ? (
        <div
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: act ? ACT : INFO }}
        />
      ) : null}
      <div className="flex flex-col gap-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Club
        </p>
        <p className="text-sm font-semibold">Tuesday club — Espoo</p>
        <p className="text-xs text-muted-foreground">
          {act
            ? "Wednesdays, 17:00 — next session in two days"
            : "Placing Aino in a group"}
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------- the role chip

/**
 * `lib/constants/roles.ts` — the gedu chip, and the only gradient in the app
 * spending the pair at its **authored values**.
 *
 * The alpha ruling does not reach it, so it is ruled here on its own terms, and
 * the owner's first idea answers it directly: two brand colours blended into
 * each other is the smear. What is left is one colour, drawn in both act and
 * world so the choice is made by looking — the chip sits beside the other three
 * role chips because a role chip's whole job is to be told apart from them at a
 * glance in an admin table, and act and world are already spent by two of those
 * three.
 */
const CHIP_BASE =
  "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold";

const GEDU_CHIPS: readonly { label: string; fill: string }[] = [
  {
    label: "from-act to-world",
    fill: "bg-gradient-to-r from-act to-world text-world-foreground",
  },
  { label: "bg-act", fill: "bg-act text-act-foreground shadow" },
  { label: "bg-world", fill: "bg-world text-world-foreground" },
];

function RoleChips({ gedu }: { gedu: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${CHIP_BASE} bg-act text-act-foreground shadow`}>
          Gamer
        </span>
        <span className={`${CHIP_BASE} bg-world text-world-foreground`}>
          Parent
        </span>
        <span className={`${CHIP_BASE} ${gedu}`}>Gedu</span>
        <span className={`${CHIP_BASE} bg-foreground text-background`}>Admin</span>
      </div>
    </div>
  );
}

// --------------------------------------------------------- the OG card

/**
 * The social card, reproduced rather than imported.
 *
 * `next/og` renders through satori at build time and cannot run inside a page,
 * and the demo may not import from Sogverse in any case, so the card is built
 * from its source's own inline styles — the same pixel values, the same order,
 * the same colours — inside a real 1200×630 box scaled to the size a feed
 * shows. That the composition is a transcription rather than the component is
 * the reason it is worth saying: a later edit to the OG source does not reach
 * this page, and this page is deleted before that can matter.
 *
 * Today's gradient is the one part that is *not* a transcription: it is built
 * from `composite()` here exactly as `GRADIENT` builds it there, so the two are
 * the same arithmetic rather than two hexes that agree today.
 *
 * `src/lib/email-templates/layout.ts` spends the identical pair in the
 * identical shape at a 70% fade stop rather than 78%, and
 * `roblox/opengraph-image.tsx` is this recipe with different words, so both are
 * ruled by this drawing rather than drawn again.
 */
const OG_SCALE = 0.35;
const OG_BAND_HEIGHT = 14;

/**
 * The pre-blurred glow, which is what a glow has to be in satori.
 *
 * Satori has no blur filter and no box-shadow, so the falloff has to be drawn
 * rather than computed: a radial from the hue at full value out to the ground,
 * one hue per shape, with the core small enough to sit behind the element that
 * emits it. The act core is 30% of a 500×300 ellipse centred on the mark, which
 * is well inside the mark's own amber plate, so what shows is the ramp escaping
 * from behind it. The world core is a wide, shallow ellipse sitting on the
 * card's bottom edge, directly above the full-value band that emits it.
 *
 * **The two blooms never overlap**, which is what keeps them from mixing: the
 * act ramp reaches the ground by y=510, and the world bloom begins at y=566.
 * Every pixel of each layer's rim is the ground colour, so the layers have no
 * visible edges and the 56px between the two blooms is plain ground. Two hues
 * that never touch cannot blend, which is the difference between this and the
 * wash beside it.
 */
const OG_ACT_GLOW = `radial-gradient(500px 300px at 600px 210px, ${ACT} 0%, ${ACT} 30%, ${GROUND} 100%)`;
const OG_WORLD_GLOW = `radial-gradient(700px 50px at 600px 50px, ${WORLD} 0%, ${WORLD} 20%, ${GROUND} 100%)`;

const OG_WASH = `linear-gradient(to bottom, transparent 0%, ${GROUND} 78%), linear-gradient(to right, ${ACT_GLOW}, ${GROUND} 50%, ${WORLD_GLOW})`;

type OgCandidate = "today" | "band" | "glow";

/** A 1200×630 card drawn at real size and scaled into a link-preview box. */
function OgFrame({
  candidate,
  children,
}: {
  candidate: OgCandidate;
  children: React.ReactNode;
}) {
  const today = candidate === "today";
  const glowing = candidate === "glow";
  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      style={{ width: 1200 * OG_SCALE, height: 630 * OG_SCALE }}
    >
      <div
        className="origin-top-left"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "1200px",
          height: "630px",
          transform: `scale(${OG_SCALE})`,
          backgroundColor: GROUND,
          backgroundImage: today ? OG_WASH : undefined,
          padding: "48px 80px",
        }}
      >
        {glowing ? (
          <>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: "580px",
                backgroundImage: OG_ACT_GLOW,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${OG_BAND_HEIGHT}px`,
                height: "50px",
                backgroundImage: OG_WORLD_GLOW,
              }}
            />
          </>
        ) : null}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {children}
        </div>
        {today ? null : (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: `${OG_BAND_HEIGHT}px`,
              backgroundColor: WORLD,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** `app/opengraph-image.tsx` — the site-wide card. */
function HomeOg({ candidate }: { candidate: OgCandidate }) {
  return (
    <OgFrame candidate={candidate}>
      <Image
        src={MARK}
        alt=""
        width={Math.round(310 * MARK_RATIO)}
        height={310}
        unoptimized
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1.12,
          marginTop: "36px",
          fontSize: "50px",
          fontWeight: 600,
          letterSpacing: "-1px",
          color: INK,
        }}
      >
        <span>Where Screen Time Becomes</span>
        <span style={{ color: ACT }}>Quality Time</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "20px",
          fontSize: "32px",
          fontWeight: 400,
          color: MUTED_INK,
        }}
      >
        Clubs, camps and events led by professional Game Educators
      </div>
    </OgFrame>
  );
}

// ---------------------------------------------------------------- section

const HERO_PANELS: readonly { label: string; candidate: HeroCandidate }[] = [
  { label: "act 20% / world 10%, a wash", candidate: "today" },
  { label: "a violet rule under the headline", candidate: "rule" },
  { label: "a violet band on the bottom edge", candidate: "band" },
  { label: "the rule and the mark, glowing", candidate: "ruleGlow" },
  { label: "the band and the mark, glowing", candidate: "bandGlow" },
  { label: "the same two glows, wide and soft", candidate: "wide" },
];

const CARD_PANELS: readonly { label: string; ground: CardGround }[] = [
  { label: "from-act/10 to-world/10", ground: "ten" },
  { label: "bg-card, an act rule", ground: "ruleAct" },
  { label: "bg-card, a violet rule", ground: "ruleWorld" },
];

const ABOUT_PANELS: readonly { label: string; ground: CardGround }[] = [
  { label: "from-act/5 to-world/5", ground: "five" },
  { label: "bg-card", ground: "none" },
];

const LIT_PANELS: readonly { label: string; ground: LitGround }[] = [
  { label: "from-act/5 to-transparent", ground: "today" },
  { label: "a 3px leading rule", ground: "rule" },
];

const OG_PANELS: readonly { label: string; candidate: OgCandidate }[] = [
  { label: "actGlow → worldGlow, a wash", candidate: "today" },
  { label: "a violet band on the bottom edge", candidate: "band" },
  { label: "the band and the mark, glowing", candidate: "glow" },
];

export function GradientsSection() {
  return (
    <Question n={2} title="Gradients">
      <Case title="The hero">
        <div className="space-y-10">
          {HERO_PANELS.map((panel) => (
            <Panel key={panel.label} label={panel.label}>
              <Exemplar
                file="app/(public)/page.tsx, roblox/roblox-hero.tsx"
                page="the home page and /roblox, above the fold"
              >
                <Hero candidate={panel.candidate} />
              </Exemplar>
            </Panel>
          ))}
        </div>
      </Case>

      <Case title="The social card">
        <Compare columns={3}>
          {OG_PANELS.map((panel) => (
            <Panel key={panel.label} label={panel.label}>
              <Exemplar
                file="app/opengraph-image.tsx"
                page="any share of the site"
              >
                <HomeOg candidate={panel.candidate} />
              </Exemplar>
            </Panel>
          ))}
        </Compare>
      </Case>

      <Case title="The closing card">
        <div className="space-y-10">
          <Compare columns={3}>
            {CARD_PANELS.map((panel) => (
              <Panel key={panel.label} label={panel.label}>
                <Exemplar
                  file="app/(public)/page.tsx, roblox/programme-cta.tsx"
                  page="the home page and /roblox, the closing call to action"
                >
                  <ClosingCard
                    ground={panel.ground}
                    heading="Ready to start?"
                    body="Create an account and pick a club."
                  />
                </Exemplar>
              </Panel>
            ))}
          </Compare>
          <Compare columns={2}>
            {ABOUT_PANELS.map((panel) => (
              <Panel key={panel.label} label={panel.label}>
                <Exemplar
                  file="about/about-section.tsx, about/yty-section.tsx"
                  page="/about and /yty, the mission card"
                >
                  <ClosingCard
                    ground={panel.ground}
                    heading="Our mission"
                    body="Turning the hours children already spend playing into hours that build them."
                  />
                </Exemplar>
              </Panel>
            ))}
          </Compare>
        </div>
      </Case>

      <Case title="A card lit from its leading edge">
        <Compare columns={2}>
          {LIT_PANELS.map((panel) => (
            <Panel key={panel.label} label={panel.label}>
              <Exemplar
                file="family/EnrollmentCard.tsx, gedu/GeduAssignmentCard.tsx"
                page="/parent and /gedu, a live card beside an awaiting one"
              >
                <div className="space-y-3">
                  <LiveCard ground={panel.ground} tone="act" />
                  <LiveCard ground={panel.ground} tone="info" />
                </div>
              </Exemplar>
            </Panel>
          ))}
        </Compare>
      </Case>

      <Case title="The gedu role chip">
        <Compare columns={3}>
          {GEDU_CHIPS.map((chip) => (
            <Panel key={chip.label} label={chip.label}>
              <Exemplar
                file="lib/constants/roles.ts"
                page="/admin/users, the role column"
              >
                <RoleChips gedu={chip.fill} />
              </Exemplar>
            </Panel>
          ))}
        </Compare>
      </Case>
    </Question>
  );
}

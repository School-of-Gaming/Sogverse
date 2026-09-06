/**
 * Question 9 — gradients.
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
 * **The candidates, the same five wherever the shape allows.** Today; the
 * ground alone with no gradient at all; a neutral gradient between two greys
 * the palette already ships; the pair at full value as a thin rule rather than
 * a wash; and the pair at full value as a wash — which will be loud, and is
 * drawn so it can be rejected on sight rather than in the abstract.
 *
 * **Sizes.** A gradient is a fact about a large area, so the heroes are drawn
 * at a wide aspect with real headline weight over them and the OG cards at the
 * size a link preview actually shows: the 1200×630 composition, built with the
 * source's own pixel values, scaled to fit. A wash judged in a swatch is not
 * judged.
 *
 * **Two things this section does not draw.** The Klingon divider is artwork and
 * rides §10. And the Roblox card's partner marks are absent on purpose: the
 * Roblox mark is approved per placement, this page is a placement nobody has
 * approved, and the gradient being ruled on has faded to flat ground long
 * before it reaches the lockup — so their heights are held by plain neutral
 * bars, which keeps the composition's geometry honest without carrying a mark
 * that needs sign-off.
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
const MUTED_INK = NEUTRALS.mutedForeground.hex;
const INK = NEUTRALS.foreground.hex;

/**
 * The two glows the OG images and the mail actually spend, computed here the
 * way `src/lib/constants/colors.ts` computes them, so the card below is painted
 * with the same two hexes the PNG is.
 */
const ACT_GLOW = composite(BRAND.act.hex, 0.2, NEUTRALS.background.hex);
const WORLD_GLOW = composite(BRAND.world.hex, 0.1, NEUTRALS.background.hex);

/** The mark, copied into the demo's own static root beside the photographs. */
const MARK = "/ruling-art/sog-logo-full.svg";
const MARK_RATIO = 379 / 207.5;

// ------------------------------------------------------------- the hero

/**
 * The hero's five grounds.
 *
 * `today` is the app's class verbatim, arbitrary value and all — the underscore
 * spelling is Tailwind's, not a transcription artefact. The two full-value
 * candidates keep the same two-layer structure, because the vertical fade to
 * the ground is what stops the wash from ending in a hard line above the next
 * section, and that half of the recipe is not in question.
 */
const HERO_GROUNDS = {
  today:
    "bg-[linear-gradient(to_bottom,_transparent_0%,_var(--color-background)_100%),linear-gradient(to_right,_color-mix(in_oklab,var(--color-act)_20%,transparent),_transparent_50%,_color-mix(in_oklab,var(--color-world)_10%,transparent))]",
  none: "bg-background",
  neutral:
    "bg-[linear-gradient(to_bottom,_transparent_0%,_var(--color-background)_100%),linear-gradient(to_right,_var(--color-card),_var(--color-background)_50%,_var(--color-card))]",
  rule: "bg-background",
  wash: "bg-[linear-gradient(to_bottom,_transparent_0%,_var(--color-background)_100%),linear-gradient(to_right,_var(--color-act),_transparent_50%,_var(--color-world))]",
} as const;

type HeroGround = keyof typeof HERO_GROUNDS;

/** `app/(public)/page.tsx` — the home hero, and `roblox/roblox-hero.tsx` byte for byte. */
function Hero({ ground }: { ground: HeroGround }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${HERO_GROUNDS[ground]}`}
    >
      <div className="px-6 py-14 text-center">
        <h4 className="text-h3 font-bold tracking-tight">
          Where screen time
          <br />
          becomes <span className="text-act">quality time</span>
        </h4>
        <p className="mx-auto mt-4 max-w-sm text-body-s text-muted-foreground">
          Clubs, camps and events led by professional Game Educators.
        </p>
        <div className="mt-6 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium shadow-sm">
            About us
          </span>
          <span className="inline-flex h-10 items-center justify-center rounded-md bg-act px-4 text-sm font-medium text-act-foreground shadow">
            Get started
          </span>
        </div>
      </div>
      {ground === "rule" ? (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-act to-world" />
      ) : null}
    </div>
  );
}

// -------------------------------------------------------- the tinted card

/**
 * The closing card, drawn at both strengths the app uses: `/10` on the home
 * page's and the programme's call to action, `/5` on the two About cards.
 *
 * The two are one construct at two values, which is itself part of the
 * question: nobody chose 10 over 5 on either surface, and a rule that says the
 * pair may not carry alpha at all makes the difference moot.
 */
const CARD_GROUNDS = {
  ten: "bg-gradient-to-r from-act/10 to-world/10",
  five: "bg-gradient-to-r from-act/5 to-world/5",
  none: "bg-card",
  neutral: "bg-gradient-to-r from-card to-muted",
  rule: "bg-card",
  wash: "bg-gradient-to-r from-act to-world",
} as const;

type CardGround = keyof typeof CARD_GROUNDS;

function ClosingCard({
  ground,
  heading,
  body,
}: {
  ground: CardGround;
  heading: string;
  body: string;
}) {
  const washed = ground === "wash";
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border text-foreground shadow-sm ${CARD_GROUNDS[ground]}`}
    >
      {ground === "rule" ? (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-act to-world" />
      ) : null}
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <h4 className={washed ? "text-h4 font-bold text-world-foreground" : "text-h4 font-bold"}>
          {heading}
        </h4>
        <p
          className={
            washed
              ? "mt-3 text-body-s text-world-foreground"
              : "mt-3 text-body-s text-muted-foreground"
          }
        >
          {body}
        </p>
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
 * single hue fading to transparent — so the "rule" candidate is a plain act
 * band rather than an act→world one, and the awaiting card is drawn beside the
 * live one because the two exist to be told apart at a glance in the same list.
 */
type LitGround = "today" | "none" | "neutral" | "rule" | "wash";

/**
 * The act half is written in classes; the info half is written inline.
 *
 * `info` is question 2's and is not a library token, so there is no
 * `from-info/5` for the stylesheet to contain — the same reason the status
 * section spells its reds inline. The two halves are otherwise the same five
 * grounds, drawn from three lookups rather than a chain of conditionals so that
 * adding a candidate is one line in one place.
 */
const LIT_ACT: Record<LitGround, string> = {
  today: "bg-gradient-to-r from-act/5 to-transparent",
  none: "bg-card",
  neutral: "bg-gradient-to-r from-muted to-transparent",
  rule: "bg-card",
  wash: "bg-gradient-to-r from-act to-transparent",
};

const LIT_INFO_CLASS: Record<LitGround, string> = {
  today: "bg-card",
  none: "bg-card",
  neutral: "bg-gradient-to-r from-muted to-transparent",
  rule: "bg-card",
  wash: "bg-card",
};

const LIT_INFO_IMAGE: Record<LitGround, string | undefined> = {
  today: `linear-gradient(to right, ${tailwindAlpha(INFO, 5)}, transparent)`,
  none: undefined,
  neutral: undefined,
  rule: undefined,
  wash: `linear-gradient(to right, ${INFO}, transparent)`,
};

function LiveCard({ ground, tone }: { ground: LitGround; tone: "act" | "info" }) {
  const act = tone === "act";
  const classes = act ? LIT_ACT[ground] : LIT_INFO_CLASS[ground];
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
 * It is therefore the one site the alpha ruling does not reach, and the one the
 * gradient ruling has to answer on its own terms. Drawn beside the other three
 * role chips, because a role chip's whole job is to be told apart from the
 * other roles at a glance in an admin table.
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
  { label: "bg-muted text-act", fill: "bg-muted text-act" },
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

// --------------------------------------------------------- the OG cards

/**
 * The social cards, reproduced rather than imported.
 *
 * `next/og` renders through satori at build time and cannot run inside a page,
 * and the demo may not import from Sogverse in any case, so each card below is
 * built from its source's own inline styles — the same pixel values, the same
 * order, the same colours — inside a real 1200×630 box scaled to the size a
 * feed shows. That the composition is a transcription rather than the component
 * is the reason it is worth saying: a later edit to the OG source does not
 * reach this page, and this page is deleted before that can matter.
 *
 * The gradient itself is the one part that is *not* a transcription: it is
 * built from `composite()` here exactly as `GRADIENT` builds it there, so the
 * two are the same arithmetic rather than two hexes that agree today.
 *
 * `src/lib/email-templates/layout.ts` spends the identical pair in the identical
 * shape at a 70% fade stop rather than 78%, so the mail's header is these panels
 * with one number nudged. It is ruled by them rather than drawn a third time.
 */
const OG_GROUNDS = {
  today: `linear-gradient(to bottom, transparent 0%, ${GROUND} 78%), linear-gradient(to right, ${ACT_GLOW}, ${GROUND} 50%, ${WORLD_GLOW})`,
  none: "none",
  neutral: `linear-gradient(to bottom, transparent 0%, ${GROUND} 78%), linear-gradient(to right, ${NEUTRALS.card.hex}, ${GROUND} 50%, ${NEUTRALS.card.hex})`,
  rule: "none",
  wash: `linear-gradient(to bottom, transparent 0%, ${GROUND} 78%), linear-gradient(to right, ${BRAND.act.hex}, ${GROUND} 50%, ${BRAND.world.hex})`,
} as const;

type OgGround = keyof typeof OG_GROUNDS;

/** A 1200×630 card drawn at real size and scaled into a link-preview box. */
function OgFrame({
  ground,
  children,
}: {
  ground: OgGround;
  children: React.ReactNode;
}) {
  return (
    <div className="h-[315px] w-[600px] max-w-full overflow-hidden rounded-lg border border-border">
      <div
        className="h-[630px] w-[1200px] origin-top-left scale-50"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: GROUND,
          backgroundImage: OG_GROUNDS[ground],
          padding: "48px 80px",
        }}
      >
        {children}
        {ground === "rule" ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "8px",
              backgroundImage: `linear-gradient(to right, ${BRAND.act.hex}, ${BRAND.world.hex})`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** `app/opengraph-image.tsx` — the site-wide card. */
function HomeOg({ ground }: { ground: OgGround }) {
  return (
    <OgFrame ground={ground}>
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

/**
 * `app/(public)/roblox/opengraph-image.tsx` — the programme's card.
 *
 * The two partner marks are held by neutral bars at their real heights (68 and
 * 54 against our 118), for the reason in this file's header: their placement is
 * a partner approval, not a rendering decision.
 */
function RobloxOg({ ground }: { ground: OgGround }) {
  return (
    <OgFrame ground={ground}>
      <div
        style={{
          display: "flex",
          gap: "18px",
          fontSize: "72px",
          fontWeight: 600,
          letterSpacing: "-1.5px",
          color: INK,
        }}
      >
        <span>Crée</span>
        <span style={{ color: ACT }}>ton propre jeu</span>
        <span>Roblox</span>
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
        Programme gratuit, animé par de vrais Game Educators
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "58px",
          fontSize: "20px",
          fontWeight: 600,
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: MUTED_INK,
        }}
      >
        Une collaboration entre
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "64px",
          marginTop: "30px",
        }}
      >
        <Image
          src={MARK}
          alt=""
          width={Math.round(118 * MARK_RATIO)}
          height={118}
          unoptimized
        />
        <span className="block w-[220px] rounded bg-muted" style={{ height: "68px" }} />
        <span className="block w-[290px] rounded bg-muted" style={{ height: "54px" }} />
      </div>
    </OgFrame>
  );
}

// ---------------------------------------------------------------- section

const HERO_PANELS: readonly { label: string; ground: HeroGround }[] = [
  { label: "act 20% / world 10%", ground: "today" },
  { label: "bg-background", ground: "none" },
  { label: "card → background → card", ground: "neutral" },
  { label: "from-act to-world, a 3px rule", ground: "rule" },
  { label: "from-act to-world, a wash", ground: "wash" },
];

const CARD_PANELS: readonly { label: string; ground: CardGround }[] = [
  { label: "from-act/10 to-world/10", ground: "ten" },
  { label: "bg-card", ground: "none" },
  { label: "from-card to-muted", ground: "neutral" },
  { label: "from-act to-world, a 3px rule", ground: "rule" },
  { label: "from-act to-world, a wash", ground: "wash" },
];

const ABOUT_PANELS: readonly { label: string; ground: CardGround }[] = [
  { label: "from-act/5 to-world/5", ground: "five" },
  { label: "bg-card", ground: "none" },
  { label: "from-card to-muted", ground: "neutral" },
  { label: "from-act to-world, a 3px rule", ground: "rule" },
  { label: "from-act to-world, a wash", ground: "wash" },
];

const LIT_PANELS: readonly { label: string; ground: LitGround }[] = [
  { label: "from-act/5 to-transparent", ground: "today" },
  { label: "bg-card", ground: "none" },
  { label: "from-muted to-transparent", ground: "neutral" },
  { label: "a 3px leading rule", ground: "rule" },
  { label: "from-act to-transparent", ground: "wash" },
];

const OG_PANELS: readonly { label: string; ground: OgGround }[] = [
  { label: "actGlow → worldGlow", ground: "today" },
  { label: "background", ground: "none" },
  { label: "card → background → card", ground: "neutral" },
  { label: "act → world, an 8px rule", ground: "rule" },
  { label: "act → world, a wash", ground: "wash" },
];

export function GradientsSection() {
  return (
    <Question n={9} title="Gradients">
      <Case title="The hero">
        <Compare columns={3}>
          {HERO_PANELS.map((panel) => (
            <Panel key={panel.label} label={panel.label}>
              <Exemplar
                file="app/(public)/page.tsx, roblox/roblox-hero.tsx"
                page="the home page and /roblox, above the fold"
              >
                <Hero ground={panel.ground} />
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
          <Compare columns={3}>
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
        <Compare columns={3}>
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
        <Compare columns={4}>
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

      <Case title="The social card">
        <div className="space-y-10">
          <Compare columns={2}>
            {OG_PANELS.map((panel) => (
              <Panel key={panel.label} label={panel.label}>
                <Exemplar
                  file="app/opengraph-image.tsx"
                  page="any share of the site"
                >
                  <HomeOg ground={panel.ground} />
                </Exemplar>
              </Panel>
            ))}
          </Compare>
          <Compare columns={2}>
            {OG_PANELS.map((panel) => (
              <Panel key={panel.label} label={panel.label}>
                <Exemplar
                  file="app/(public)/roblox/opengraph-image.tsx"
                  page="any share of /roblox"
                >
                  <RobloxOg ground={panel.ground} />
                </Exemplar>
              </Panel>
            ))}
          </Compare>
        </div>
      </Case>
    </Question>
  );
}

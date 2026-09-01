/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { Fragment } from "react";
import Image from "next/image";
import { Crimson_Pro } from "next/font/google";
import sogLogoSimple from "@/assets/brand/sog-logo-simple.svg";
import { SogWordmark } from "@/components/brand/sog-wordmark";
import { NeedsAttentionPanel } from "@/components/admin/dashboard/needs-attention-panel";
import { ROLE_BADGE_STYLES } from "@/lib/constants/roles";
import { YTY_PRESENTATIONS } from "@/lib/constants/voice-zones";
import { YTY_ELEMENTS } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The typography half of the brand design pass, split out of the
 * colour walkthrough so it can be ruled on independently — none of the rulings
 * below waits on a colour decision. Deleted from this branch before the wiring
 * phase lands, together with the colour deck at
 * `/admin/design-pass-walkthrough`.
 *
 * Deliberately absent from the admin sidebar and from every index. The proxy
 * role-gates every path under `/admin`, so reaching it by URL is already gated
 * without this page doing anything.
 *
 * **Show, don't tell — this page is exhibits, not argument** (owner direction,
 * 2026-09-01: "update them so I can see what you mean and not read what you
 * mean"). Every slide is a title, a rendered comparison, at most one caption
 * line, and a one-line ruling. The reasoning behind each recommendation is not
 * on the page: it lives in the session reports, in the plan, and in these code
 * comments. A slide carrying more words than the UI it shows is a bug.
 *
 * **Press Start 2P is retiring** (owner ruling, 2026-09-01: "we don't need our
 * Press Start 2P when the Guidebook has given us so much to work with" — the
 * same move as retiring the invented colours). So the site slides no longer ask
 * whether a site keeps the face; they ask what replaces it there. All six of its
 * sites lose it: four are re-set in another face, the admin all-clear may lose
 * its title with the face rather than be re-set at all, and the profile-select
 * header is answered by artwork rather than by type — the main header already
 * draws the real mark, and the lettered "SOG" there is an outdated stand-in.
 *
 * **Face is voice, which is what decides each replacement.** Poppins is the app
 * speaking, Space Mono is Sogverse-the-world speaking, Crimson Pro is editorial,
 * Dancing Script signs a name. A parent-facing marketing surface takes Poppins —
 * the Guidebook is explicit that Poppins is what carries parent trust and that
 * the mono belongs inside the world — and an in-platform surface a child meets is
 * where the world-voice argument is live.
 *
 * **Every specimen is the real string in the real classes.** Each site slide
 * draws the heading that site actually renders — the English message, decomposed
 * from its rich-text tags where it has any — set in the class list the live
 * component carries, beside its replacement candidates.
 *
 * **The sizing rule behind every Space Mono row.** Press Start 2P advances
 * exactly one em per character; Space Mono advances about 0.6. So a string keeps
 * its *line footprint* across a swap only at roughly 1.67x the font size, and
 * that is the size each footprint-matched Space Mono row is drawn at — the
 * footprint is what the existing layout has room for. The eye reads the two
 * faces as much closer than that, which is why the greeting's draft raises the
 * size by 1.2x and pockets the difference as slack; that trade is the
 * greeting-size slide, and it is drawn rather than explained. Poppins rows are
 * sized from the Guidebook's own scale instead (A.3: H1 48–56px / 600 / 1.1),
 * because a replacement that is going to live there should be drawn at the size
 * it will live at, not at the size the retiring face happened to need.
 *
 * **Honesty caveat, stated once here rather than on every slide.** Tailwind
 * breakpoints read the *viewport*, so every size on this page is written out
 * literally rather than left to a `md:` prefix — a breakpoint inside a narrow box
 * on a wide screen would quietly show the wide size and call it the phone. Where
 * the layout around a line is the point and cannot be reproduced inline, the
 * slide falls back to the nearest honest sample plus a link.
 *
 * **The furniture is a copy of the colour deck's, not an import.** Both pages are
 * deleted in the same change, and a shared module between two doomed pages is a
 * third thing to delete plus a reason for someone to keep it.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "faces", title: "The face inventory" },
  { id: "site-home", title: "The home hero" },
  { id: "site-greeting", title: "The gamer greeting" },
  { id: "site-roblox", title: "The Roblox programme hero" },
  { id: "site-profile", title: "The profile-select mark" },
  { id: "site-call-ended", title: "The call-ended screen" },
  { id: "site-all-clear", title: "The admin all-clear" },
  { id: "tracking", title: "Tracking on the pixel face" },
  { id: "greeting-size", title: "The greeting at 360" },
  { id: "cta-type", title: "CTA type" },
  { id: "mono-reach", title: "Space Mono’s reach" },
  { id: "recap", title: "Recap" },
] as const;

type SlideId = (typeof SLIDES)[number]["id"];

/* ------------------------------------------------------------------ */
/*  Slide furniture                                                    */
/* ------------------------------------------------------------------ */

function Slide({ id, children }: { id: SlideId; children: React.ReactNode }) {
  const index = SLIDES.findIndex((slide) => slide.id === id);
  const slide = SLIDES[index];

  return (
    <section
      id={id}
      className="scroll-mt-[calc(var(--header-height)+1rem)] space-y-4 rounded-lg border p-6"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums text-primary">
          {index + 1}
        </span>
        <h2 className="text-2xl font-bold">{slide.title}</h2>
      </div>
      {children}
    </section>
  );
}

/** One line, and only where the exhibit above it is not self-labelling. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose text-sm text-muted-foreground">{children}</p>
  );
}

/** The ask, in one line, with the recommendation folded in rather than argued. */
function Ruling({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Ruling
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function DeckLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  );
}

/** The row of full-page links a slide ends with, where any exist. */
function Links({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4 text-xs">{children}</div>;
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exhibits                                                           */
/* ------------------------------------------------------------------ */

/**
 * One setting of the words: a caption naming the face and size, and the line
 * itself on the page's own ground.
 *
 * `overflow-x-auto` on the box rather than wrapping — a footprint-matched Space
 * Mono row at hero size is wider than this column, and a wrapped specimen would
 * be measuring the deck's column instead of the face.
 */
function Setting({
  label,
  className,
  lines,
}: {
  label: string;
  className: string;
  lines: readonly string[];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="overflow-x-auto rounded-lg border bg-background p-4">
        <p className={cn("w-max", className)}>
          {lines.map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/** The same words in several settings, stacked so the widths line up. */
function Stack({
  settings,
  lines,
}: {
  settings: readonly { label: string; className: string }[];
  lines: readonly string[];
}) {
  return (
    <div className="space-y-3">
      {settings.map((setting) => (
        <Setting key={setting.label} {...setting} lines={lines} />
      ))}
    </div>
  );
}

/** The same words in two settings, side by side, for judging one difference. */
function Pair({
  settings,
  lines,
}: {
  settings: readonly { label: string; className: string }[];
  lines: readonly string[];
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {settings.map((setting) => (
        <Setting key={setting.label} {...setting} lines={lines} />
      ))}
    </div>
  );
}

/**
 * The sites Press Start 2P is leaving, and what is offered in its place.
 *
 * `lines` is the site's own English string with its rich-text tags resolved: the
 * home hero and the call-ended screen both set `home.hero.title`, whose `<br>`
 * chunks are the four beats; the /roblox hero's three beats come from
 * `roblox.hero.title` the same way. The colour chunks are deliberately dropped —
 * a type comparison in three colours is a colour comparison.
 *
 * Two sizing rules, one per candidate face (both stated in the module comment).
 * A Space Mono row is footprint-matched to the pixel face it replaces — 60px
 * against 96px mono, 30 against 48, 16 against 24 — because the existing layout
 * has room for the footprint. A Poppins row is drawn at the Guidebook's own
 * scale for the heading level it is: H1 48–56px / 600 / 1.1, H3 24–28 / 600 /
 * 1.3.
 *
 * Where a slide offers no Space Mono row, that is the voice argument doing the
 * work rather than an omission: the home and /roblox heroes are parent-facing
 * marketing, and the Guidebook keeps the mono out of exactly that copy.
 */
const HOME_HERO_LINES = [
  "Where",
  "Screen Time",
  "Becomes",
  "Quality Time",
] as const;

const HOME_SETTINGS = [
  {
    label: "Today — Press Start 2P, 60px",
    className: "font-display text-6xl font-bold tracking-tight",
  },
  {
    label: "Poppins SemiBold, 56px / 1.1 — the Guidebook’s H1",
    className: "font-sans text-[56px] font-semibold leading-[1.1]",
  },
] as const;

const GREETING_SETTINGS = [
  {
    label: "Today — Press Start 2P, 30px",
    className: "font-display text-3xl font-bold",
  },
  {
    label: "Space Mono, 36px — as drafted",
    className: "font-brand-mono text-4xl font-bold",
  },
  {
    label: "Space Mono, 48px — today’s footprint",
    className: "font-brand-mono text-5xl font-bold",
  },
  {
    label: "Poppins SemiBold, 36px / 1.2 — the Guidebook’s H2",
    className: "font-sans text-4xl font-semibold leading-[1.2]",
  },
] as const;

const ROBLOX_SETTINGS = [
  {
    label: "Today — Press Start 2P, 60px",
    className: "font-display text-6xl font-bold leading-snug",
  },
  {
    label: "Poppins SemiBold, 56px / 1.1 — the Guidebook’s H1",
    className: "font-sans text-[56px] font-semibold leading-[1.1]",
  },
] as const;

const CALL_ENDED_SETTINGS = [
  {
    label: "Today — Press Start 2P, 30px",
    className: "font-display text-3xl font-bold leading-tight tracking-tight",
  },
  {
    label: "Poppins SemiBold, 28px / 1.3 — the Guidebook’s H3",
    className: "font-sans text-[28px] font-semibold leading-[1.3]",
  },
  {
    label: "Space Mono, 48px — today’s footprint",
    className: "font-brand-mono text-5xl font-bold leading-tight",
  },
] as const;

const ALL_CLEAR_SETTINGS = [
  {
    label: "Today — Press Start 2P, 16px",
    className:
      "font-display text-base leading-relaxed tracking-normal text-primary",
  },
  {
    label: "Space Mono, 24px — today’s footprint",
    className: "font-brand-mono text-2xl font-bold text-primary",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Slide 1 — the faces                                                */
/* ------------------------------------------------------------------ */

const FACE_SAMPLE = ["Clubs, camps and events"] as const;

/**
 * Crimson Pro, loaded for this page and nothing else.
 *
 * The Guidebook's serif accent is not in the app — no token points at it and no
 * surface sets it — so an inventory either shows it or lies about the shape of
 * the roster. Loading it here is deliberately *not* a placement: no `@theme`
 * entry, no `--font-*` token, no variable on `<html>`, so nothing outside this
 * file can reach the face and deleting the file deletes the load. `preload:
 * false` for the same reason Space Mono carries it — one admin reading a deck is
 * not worth a preload on every visitor's page. No `weight`, because Crimson Pro
 * is a variable font: the whole axis arrives, so the specimen rows can ask for
 * 700 and 400 through the ordinary utilities like every other row.
 */
const crimsonPro = Crimson_Pro({
  subsets: ["latin", "latin-ext"],
  preload: false,
});

/**
 * The roster, one row per face, in the order the Guidebook introduces them —
 * the three working faces first, then the two the app added on its own.
 *
 * `status` is the Guidebook's standing for the face, and `job` is the voice it
 * carries; the same sample string runs across every row so the rows compare
 * themselves. Dancing Script set in a sentence is unreadable, and that is the
 * honest thing to show: its only job is a name on a line, drawn beside its own
 * ruling further down.
 */
const FACE_ROWS: readonly {
  name: string;
  status: string;
  source: string;
  job: string;
  className: string;
}[] = [
  {
    name: "Poppins",
    status: "Workhorse",
    source: "--font-sans",
    job: "The app speaking — headings and body copy.",
    className: "font-sans",
  },
  {
    name: "Space Mono",
    status: "World",
    source: "--font-brand-mono",
    job: "Sogverse speaking — in-platform UI, quest and story art.",
    className: "font-brand-mono",
  },
  {
    name: "Crimson Pro",
    status: "Serif accent",
    source: "loaded by this page alone",
    job: "Editorial headlines and pull quotes — never long UI text.",
    className: crimsonPro.className,
  },
  {
    name: "Press Start 2P",
    status: "Retiring",
    source: "--font-display",
    job: "Six sites; each one’s replacement is a slide below.",
    className: "font-display",
  },
  {
    name: "Dancing Script",
    status: "Unlogged",
    source: "--font-cursive",
    job: "A signature, and nothing else.",
    className: "font-cursive",
  },
];

/**
 * The rest of the Guidebook's roster. We hold no files for any of them, so a
 * rendered "specimen" would be the page's own face wearing another face's name —
 * the one thing a specimen table must never do. Names, dashed boxes, no
 * specimens.
 */
const NAMED_ONLY: readonly { name: string; status: string }[] = [
  { name: "Lazydog", status: "Campaign" },
  { name: "Shlop", status: "Campaign" },
  { name: "True Typewriter", status: "Campaign" },
  { name: "Work Sans", status: "Retired" },
  { name: "Plus Jakarta Sans", status: "Dropped" },
];

/**
 * The signature exactly as the gedu contract draws it: the ceremony line's
 * label, its 64px rule, and the name sitting on it in the cursive face.
 *
 * The live line is `text-3xl sm:text-4xl`; this draws the wide size literally,
 * per the breakpoint caveat in the module comment. The name is a fixture.
 */
function SignatureExhibit() {
  return (
    <div className="w-full max-w-sm rounded-lg border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Signature
      </p>
      <div className="mt-1 flex h-16 items-end border-b border-border">
        <span className="px-2 pb-2 font-cursive text-4xl leading-none">
          Aino Virtanen
        </span>
      </div>
    </div>
  );
}

const FACE_SIZES: readonly { label: string; className: string }[] = [
  { label: "30px / 700", className: "text-3xl font-bold" },
  { label: "18px / 600", className: "text-lg font-semibold" },
  { label: "14px / 400", className: "text-sm" },
];

/**
 * The synthesised-bold exhibit. Press Start 2P ships weight 400 only, so
 * `font-bold` on it is the browser thickening the glyphs rather than the foundry
 * redrawing them — which on a pixel face is the one blur it cannot absorb. Drawn
 * rather than asserted, because "synthesised" is a word and this is a picture.
 */
const WEIGHT_SETTINGS = [
  {
    label: "Press Start 2P — weight 400, as drawn",
    className: "font-display text-3xl font-normal",
  },
  {
    label: "Press Start 2P — font-bold, synthesised by the browser",
    className: "font-display text-3xl font-bold",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Slide 8 — tracking                                                 */
/* ------------------------------------------------------------------ */

/**
 * `tracking-tight` is −0.025em. On the pixel face that is −1.5px per glyph at
 * 60px, which pulls square edges into their neighbours. The home hero and the
 * call-ended screen both carry it; the /roblox hero comments that it must not,
 * and the admin all-clear explicitly cancels the tight tracking its card title
 * would otherwise inherit. So the codebase already holds the argument and two
 * surfaces are on the wrong side of it — shown here at both affected sizes.
 */
const TRACKING_HERO = [
  {
    label: "Home hero today — text-6xl, tracking-tight",
    className: "font-display text-6xl font-bold tracking-tight",
  },
  {
    label: "text-6xl, tracking-normal",
    className: "font-display text-6xl font-bold tracking-normal",
  },
] as const;

const TRACKING_CARD = [
  {
    label: "Call-ended today — text-3xl, tracking-tight",
    className: "font-display text-3xl font-bold tracking-tight",
  },
  {
    label: "text-3xl, tracking-normal",
    className: "font-display text-3xl font-bold tracking-normal",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Slide 4 — the /roblox hero                                         */
/* ------------------------------------------------------------------ */

/**
 * The hero's three beats. Its component picks a scale by measuring whether any
 * beat exceeds eight characters, a test that is only valid because the pixel
 * face advances exactly one em per character — so the face leaving takes that
 * arithmetic with it, which is the cost stated in this slide's ruling.
 */
const BEATS_EN = ["Build It", "Play It", "Own It"] as const;

/* ------------------------------------------------------------------ */
/*  Slide 9 — the greeting at the floor                                */
/* ------------------------------------------------------------------ */

/**
 * 312px, not 360: the gamer dashboard's shell is `container p-6`, and the
 * container is full-width below `sm`, so 360px of viewport is 312px of content.
 * The width sits on its own element with the demo's border and padding on a
 * wrapper outside it — Tailwind sets `box-sizing: border-box`, so a single
 * element carrying both would be a 286px content box and would wrap earlier than
 * a real phone does.
 *
 * Finnish sets the longest first word of the five locales ("Tervetuloa," against
 * French's "Bienvenue,"), so it is the line that wraps first and the one worth
 * drawing beside English.
 */
const GREETING_FLOOR: readonly {
  label: string;
  text: string;
  className: string;
}[] = [
  {
    label: "Today — Press Start 2P, 20px",
    text: "Welcome, Aino!",
    className: "font-display text-xl",
  },
  {
    label: "Today — Press Start 2P, 20px, Finnish",
    text: "Tervetuloa, Aino!",
    className: "font-display text-xl",
  },
  {
    label: "Draft — Space Mono, 24px",
    text: "Welcome, Aino!",
    className: "font-brand-mono text-2xl",
  },
  {
    label: "Draft — Space Mono, 24px, Finnish",
    text: "Tervetuloa, Aino!",
    className: "font-brand-mono text-2xl",
  },
];

const GREETING_WIDE: readonly {
  label: string;
  className: string;
}[] = [
  { label: "Today — Press Start 2P, 30px", className: "font-display text-3xl" },
  { label: "Draft — Space Mono, 36px", className: "font-brand-mono text-4xl" },
  {
    label: "Space Mono, 48px — today’s footprint",
    className: "font-brand-mono text-5xl",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 10 — CTA type                                                */
/* ------------------------------------------------------------------ */

/**
 * The real variant recipe at its default size, minus the type classes, which are
 * the variable.
 *
 * **Written out rather than called for.** The colour deck's button slide quotes a
 * recounted blast radius per variant, and a review aid that adds call sites to
 * the number it asks a decision about would be arguing for the wrong decision.
 * Inert spans at rest; the style guide draws every state.
 */
const CTA_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 transition-colors";

const CTA_TYPE_TODAY = "text-sm font-medium";
const CTA_TYPE_GUIDEBOOK = "text-base font-semibold";

const CTA_ROWS: readonly { name: string; className: string }[] = [
  {
    name: "Primary",
    className: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  },
  {
    name: "Secondary on dark",
    className:
      "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground/10",
  },
  {
    name: "Third tier A — ghost",
    className: "hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier B — quiet border",
    className:
      "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier C — label only",
    className: "text-muted-foreground hover:text-foreground",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 11 — Space Mono's reach                                      */
/* ------------------------------------------------------------------ */

/**
 * The candidates the plan named for Space Mono beyond the greeting, drawn in the
 * shape each one actually has rather than argued in a table. Nothing here is
 * drafted — no scenario renders any of it — so each is the *live* element with
 * its label reset in the mono face beside it.
 *
 * A fourth candidate, Yty-Points and Yty-Level figures, is a note rather than an
 * exhibit: no surface draws them, so there is no honest thing to render, and that
 * absence is itself the argument for parking it.
 */
const ROLE_BADGES: readonly { label: string; className: string }[] = [
  { label: "Gamer", className: ROLE_BADGE_STYLES.gamer },
  { label: "Parent", className: ROLE_BADGE_STYLES.customer },
  { label: "Gedu", className: ROLE_BADGE_STYLES.gedu },
  { label: "Admin", className: ROLE_BADGE_STYLES.admin },
];

const SECTION_HEADINGS = ["Clubs", "Camps", "Events", "Help"] as const;

/** A zone row at the shape `ZoneList` draws it: tinted glyph tile, then label. */
function ZoneRow({ faceClass }: { faceClass: string }) {
  return (
    <div className="w-64 space-y-2 rounded-lg border p-3">
      {YTY_PRESENTATIONS.map((zone, index) => {
        const Icon = zone.icon;
        return (
          <div key={zone.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                zone.color.tile,
              )}
            >
              <Icon className={cn("h-5 w-5", zone.color.glyph)} aria-hidden />
            </span>
            <span
              className={cn("flex-1 truncate text-sm font-medium", faceClass)}
            >
              {YTY_ELEMENTS[index].name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A candidate exhibit: the live shape, then the same shape in Space Mono. */
function Candidate({
  title,
  note,
  today,
  mono,
}: {
  title: string;
  note: string;
  today: React.ReactNode;
  mono: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Marker>{title}</Marker>
      <div className="flex flex-wrap items-start gap-6">
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">Today — Poppins</div>
          {today}
        </div>
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground">Space Mono</div>
          {mono}
        </div>
      </div>
      <p className="max-w-prose text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassTypographyPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
        <p className="max-w-prose text-sm text-foreground">
          <span className="font-semibold text-destructive">Temporary</span> —
          review aid for the brand design pass, deleted before merge.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Brand design pass — typography</h1>
        <p className="max-w-prose text-muted-foreground">
          Press Start 2P is retiring, so each slide shows a site&rsquo;s real
          words as they render today beside what replaces them, and asks one
          question — colour is the other deck, at{" "}
          <DeckLink href="/admin/design-pass-walkthrough">
            /admin/design-pass-walkthrough
          </DeckLink>
          .
        </p>
      </div>

      <nav className="rounded-lg border p-4">
        <ol className="flex flex-wrap gap-x-2 gap-y-2">
          {SLIDES.map((slide, index) => (
            <li key={slide.id}>
              <a
                href={`#${slide.id}`}
                className="inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span>{slide.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ----------------------------------------------------------- 1 */}
      <Slide id="faces">
        <div className="divide-y rounded-lg border">
          {FACE_ROWS.map((face) => (
            <div
              key={face.name}
              className="grid gap-4 p-4 md:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  {face.name}
                </div>
                <Marker>{face.status}</Marker>
                <div className="text-[11px] text-muted-foreground">
                  {face.source}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {face.job}
                </div>
              </div>
              <div className="min-w-0 space-y-3">
                {FACE_SIZES.map((size) => (
                  <div key={size.label} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">
                      {size.label}
                    </div>
                    <p
                      className={cn(
                        face.className,
                        size.className,
                        "break-words",
                      )}
                    >
                      {FACE_SAMPLE[0]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Marker>Named only — no files here, so no specimens</Marker>
          <div className="flex flex-wrap gap-2">
            {NAMED_ONLY.map((face) => (
              <span
                key={face.name}
                className="inline-flex items-baseline gap-2 rounded-md border border-dashed px-3 py-1.5"
              >
                <span className="text-sm text-foreground">{face.name}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {face.status}
                </span>
              </span>
            ))}
          </div>
        </div>

        <Pair settings={WEIGHT_SETTINGS} lines={FACE_SAMPLE} />
        <Caption>
          Press Start 2P ships one weight — every bold you see in it is
          browser-synthesised, not drawn.
        </Caption>

        <div className="space-y-2">
          <Marker>Dancing Script&rsquo;s one site — the gedu contract</Marker>
          <SignatureExhibit />
        </div>

        <Ruling>
          Dancing Script — log it as a sanctioned signature exception, or replace
          the signature treatment. (recommended: log it)
        </Ruling>

        <Ruling>
          Crimson Pro — place it on an editorial surface, or park it until one
          exists. (recommended: park)
        </Ruling>

        <Links>
          <DeckLink href="/admin/ui-components#type-faces-specimens">
            The permanent specimens in the style guide
          </DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="site-home">
        <Stack settings={HOME_SETTINGS} lines={HOME_HERO_LINES} />
        <Caption>
          No Space Mono row: this is the parent-facing marketing surface the
          Guidebook keeps the world&rsquo;s face out of.
        </Caption>

        <Ruling>
          Home hero — Poppins at the Guidebook&rsquo;s H1, or another face named
          here. (recommended: Poppins)
        </Ruling>

        <Links>
          <DeckLink href="/">The live home page</DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="site-greeting">
        <Stack settings={GREETING_SETTINGS} lines={["Welcome, Aino!"]} />
        <Caption>
          The one site already drafted — a child reads this line every visit,
          inside the world.
        </Caption>

        <Ruling>
          Gamer greeting — Space Mono as drafted, or Poppins. (recommended: Space
          Mono)
        </Ruling>

        <Links>
          <DeckLink href="/preview/gamer-dashboard/typical">
            The page as it ships
          </DeckLink>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            The same page with the swap
          </DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="site-roblox">
        <Stack settings={ROBLOX_SETTINGS} lines={BEATS_EN} />
        <Caption>
          This hero sits above the lockup Roblox approved as given, so any change
          here ships only on your explicit go-ahead and a partner review.
        </Caption>

        <Ruling>
          /roblox hero — Poppins at the Guidebook&rsquo;s H1, which also rewrites
          the character-count scale, or hold pending partner review.
          (recommended: Poppins, gated on the review)
        </Ruling>

        <Links>
          <DeckLink href="/roblox">The live hero, with the lockup beside it</DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="site-profile">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              Today — /select-profile letters it
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold text-primary">
                  SOG
                </span>
                <span className="text-lg font-semibold">Sogverse</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              The main header — badge plus the mark&rsquo;s own lettering
            </div>
            <div className="rounded-lg border bg-background p-4">
              {/* The signed-out header's composition, mirrored: the badge at
                  its wide height beside `SogWordmark` at 15px. Not a link here,
                  matching /select-profile, where the mark is deliberately
                  non-clickable so nobody is yanked out of the picker. */}
              <span className="flex items-center gap-2">
                <Image
                  src={sogLogoSimple}
                  alt=""
                  width={379}
                  height={207.5}
                  className="h-11 w-auto"
                  unoptimized
                />
                <SogWordmark height={15} className="text-foreground" />
              </span>
            </div>
          </div>
        </div>
        <Caption>
          Not a typeface question — and answering it with the drawn mark removes
          one of the six Press Start 2P sites outright.
        </Caption>

        <Ruling>
          Profile-select — replace the typed stand-in with the header&rsquo;s
          real mark, non-clickable as today, or keep the stand-in. (recommended:
          replace)
        </Ruling>

        <Links>
          <DeckLink href="/select-profile">The profile picker</DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="site-call-ended">
        <Stack settings={CALL_ENDED_SETTINGS} lines={HOME_HERO_LINES} />
        <Caption>
          It reads <code>home.hero.title</code> but is met inside a call, not on
          the marketing page — and it has no standalone URL.
        </Caption>

        <Ruling>
          Call-ended screen — Poppins, as the marketing line it quotes, or Space
          Mono, as the world it is met in. (recommended: open)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="site-all-clear">
        <NeedsAttentionPanel products={[]} />

        <Stack settings={ALL_CLEAR_SETTINGS} lines={["All clear"]} />
        <Caption>
          The real panel, above — the pixel face and the pixel trophy are one joke
          in two parts, so they go together or stay together.
        </Caption>

        <Ruling>
          Admin all-clear — retire the title and the sprite together, or re-set
          the title in Space Mono beside it. (recommended: Space Mono)
        </Ruling>

        <Links>
          <DeckLink href="/admin">
            The live dashboard, when nothing needs attention
          </DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 8 */}
      <Slide id="tracking">
        <Pair settings={TRACKING_HERO} lines={["Quality Time"]} />
        <Pair settings={TRACKING_CARD} lines={["Quality Time"]} />
        <Caption>
          The home hero and the call-ended screen set the pixel face
          <code>tracking-tight</code>; /roblox and the admin all-clear
          deliberately do not.
        </Caption>

        <Ruling>
          Wherever a replacement is deferred — /roblox pending partner review, or
          any site you hold — drop <code>tracking-tight</code> meanwhile, or
          leave it. (recommended: drop)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 9 */}
      <Slide id="greeting-size">
        <div className="space-y-3">
          <Marker>At the floor — a 360px phone gives this page 312px</Marker>
          <div className="flex flex-wrap gap-4">
            {GREETING_FLOOR.map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {row.label}
                </div>
                <div className="w-fit rounded-lg border bg-background p-3">
                  <div className="w-[312px]">
                    <p
                      className={cn(
                        "text-center font-bold text-primary break-words",
                        row.className,
                      )}
                    >
                      {row.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>On a wide screen</Marker>
          {GREETING_WIDE.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{row.label}</div>
              <div className="overflow-x-auto rounded-lg border bg-background p-3">
                <p
                  className={cn(
                    "w-max font-bold text-primary",
                    row.className,
                  )}
                >
                  Welcome, Aino!
                </p>
              </div>
            </div>
          ))}
        </div>

        <Ruling>
          The greeting&rsquo;s wide size — 36px as drafted, or 48px to keep
          today&rsquo;s footprint. (recommended: 36px)
        </Ruling>

        <Links>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            The whole page under the draft
          </DeckLink>
          <DeckLink href="/admin/ui-components#type-faces-the-gamer-greeting-at-the-360px-floor">
            The floor comparison in the style guide
          </DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 10 */}
      <Slide id="cta-type">
        <div className="overflow-x-auto">
          <div className="grid min-w-[36rem] grid-cols-[minmax(12rem,auto)_repeat(2,minmax(10rem,1fr))] items-center gap-x-6 gap-y-3">
            <div />
            <Marker>Today — 14px / 500</Marker>
            <Marker>Guidebook — 16px / 600</Marker>
            {CTA_ROWS.map((row) => (
              <Fragment key={row.name}>
                <div className="text-sm text-foreground">{row.name}</div>
                <div>
                  <span className={cn(CTA_SHAPE, CTA_TYPE_TODAY, row.className)}>
                    Explore clubs
                  </span>
                </div>
                <div>
                  <span
                    className={cn(CTA_SHAPE, CTA_TYPE_GUIDEBOOK, row.className)}
                  >
                    Explore clubs
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <Ruling>
          CTA type — today&rsquo;s 14px / 500, or the Guidebook&rsquo;s 16px /
          600. (recommended: 16px / 600)
        </Ruling>

        <Links>
          <DeckLink href="/admin/ui-components#button-cta-type-today-beside-guidebook">
            Every proposed variant at both types
          </DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 11 */}
      <Slide id="mono-reach">
        <Candidate
          title="Voice-room zone list"
          note="The most in-world surface there is — but a zone name is a moderator-authored string of up to 40 characters, and mono is the widest face to hand an unbounded label."
          today={<ZoneRow faceClass="font-sans" />}
          mono={<ZoneRow faceClass="font-brand-mono" />}
        />

        <Candidate
          title="Badge labels"
          note="Short fixed strings are what mono flatters — but these are the app’s most repeated element, and the colour grammar is already moving them."
          today={
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              {ROLE_BADGES.map((badge) => (
                <span
                  key={badge.label}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          }
          mono={
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              {ROLE_BADGES.map((badge) => (
                <span
                  key={badge.label}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 font-brand-mono text-xs font-bold",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          }
        />

        <Candidate
          title="Gamer dashboard section headings"
          note="They sit directly under the greeting, so a swapped greeting leaves the page in two voices — or they are structure, and Poppins carries structure everywhere else."
          today={
            <div className="space-y-2 rounded-lg border p-3">
              {SECTION_HEADINGS.map((heading) => (
                <p key={heading} className="text-3xl font-bold">
                  {heading}
                </p>
              ))}
            </div>
          }
          mono={
            <div className="space-y-2 rounded-lg border p-3">
              {SECTION_HEADINGS.map((heading) => (
                <p key={heading} className="font-brand-mono text-3xl font-bold">
                  {heading}
                </p>
              ))}
            </div>
          }
        />

        <Caption>
          A fourth candidate — Yty-Points and Yty-Level figures — has no surface
          drawing it yet, so there is nothing honest to show.
        </Caption>

        <Ruling>
          Space Mono beyond the greeting — park all of these, or name which to
          draft. (recommended: park)
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 12 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>Dancing Script — log the signature exception, or replace it.</li>
          <li>Crimson Pro — place it on an editorial surface, or park it.</li>
          <li>Home hero — Poppins at the Guidebook&rsquo;s H1, or name another.</li>
          <li>Gamer greeting — Space Mono as drafted, or Poppins.</li>
          <li>/roblox hero — Poppins, gated on the partner review.</li>
          <li>Profile-select — the real mark, or the typed stand-in.</li>
          <li>Call-ended screen — Poppins, or Space Mono.</li>
          <li>
            Admin all-clear — retire the title and sprite, or re-set the title in
            Space Mono.
          </li>
          <li>
            <code>tracking-tight</code> — drop it wherever a replacement is
            deferred, or leave it.
          </li>
          <li>Greeting&rsquo;s wide size — 36px, or 48px.</li>
          <li>CTA type — 14px / 500, or 16px / 600.</li>
          <li>Space Mono&rsquo;s reach — park the candidates, or name which to draft.</li>
        </ol>
      </Slide>
    </div>
  );
}

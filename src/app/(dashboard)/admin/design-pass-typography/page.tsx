/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { Fragment } from "react";
import { NeedsAttentionPanel } from "@/components/admin/dashboard/needs-attention-panel";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The typography half of the brand design pass, split out of the
 * colour walkthrough so it can be ruled on independently — none of the rulings
 * below waits on a colour decision, and mixing the two made a sixteen-slide deck
 * that had to be read in one sitting to be answered at all. The colour deck
 * lives at `/admin/design-pass-walkthrough` and no longer carries type.
 *
 * Deleted from this branch before the wiring phase lands, together with the
 * colour deck. It is in no sidebar and no index; the proxy role-gates every path
 * under `/admin`, so reaching it by URL is already gated without this page doing
 * anything.
 *
 * **The furniture is deliberately a copy of the colour deck's, not an import.**
 * Both pages are deleted in the same change, and a shared module between two
 * doomed pages is a third thing to delete plus a reason for someone to keep it.
 *
 * **Every specimen is the real string in the real classes.** Each Press Start 2P
 * slide draws the heading that site actually renders — the English message,
 * decomposed from its rich-text tags where it has any — set in the class list the
 * live component carries, beside the same words in Space Mono and in Poppins. A
 * keep/swap/drop is then judged on the words the reader meets, not on a pangram.
 *
 * **Two honesty caveats.** Tailwind breakpoints read the *viewport*, so every
 * size here is written out literally rather than left to a `md:` prefix — a
 * breakpoint inside a narrow box on a wide screen quietly shows the wide size and
 * calls it the phone. And a specimen is a line, not a page: where the layout
 * around the line is the point (the /roblox hero beside the partner lockup, the
 * greeting at the 360px floor) the slide says so and leans on its link.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "context", title: "What this page decides" },
  { id: "faces", title: "The three faces" },
  { id: "site-home", title: "Press Start 2P — the home hero" },
  { id: "site-greeting", title: "Press Start 2P — the gamer greeting" },
  { id: "site-roblox", title: "Press Start 2P — the Roblox programme hero" },
  { id: "site-profile", title: "Press Start 2P — the profile-select wordmark" },
  { id: "site-call-ended", title: "Press Start 2P — the call-ended screen" },
  { id: "site-all-clear", title: "Press Start 2P — the admin all-clear" },
  { id: "greeting-size", title: "The greeting, in detail" },
  { id: "cta-type", title: "CTA type" },
  { id: "mono-reach", title: "Space Mono’s reach beyond the greeting" },
  { id: "recap", title: "Recap, and the typography rulings" },
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
      className="scroll-mt-[calc(var(--header-height)+1rem)] space-y-5 rounded-lg border p-6"
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

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Ruling({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Ruling asked
      </div>
      <div className="max-w-prose space-y-2 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

function NoRuling({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        No ruling
      </div>
      <div className="max-w-prose text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

/** A plain outbound link, the one link shape this page uses. */
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

function DeckTable({
  head,
  children,
}: {
  head: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="pb-2 pr-6 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-t py-2.5 pr-6 align-top",
        muted && "text-muted-foreground",
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/*  Specimens                                                          */
/* ------------------------------------------------------------------ */

/**
 * One line of type: a caption naming the face and the size, and the words set in
 * it on the page's own ground.
 *
 * `overflow-x-auto` on the box rather than wrapping: a footprint-matched Space
 * Mono row at hero size is wider than this column, and a wrapped specimen would
 * be measuring the deck's column instead of the face.
 */
function Specimen({
  caption,
  className,
  lines,
}: {
  caption: string;
  className: string;
  lines: readonly string[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{caption}</div>
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

/**
 * One Press Start 2P site, as the slide draws it.
 *
 * `lines` is the site's own English string with its rich-text tags resolved: the
 * home hero and the call-ended screen both set `home.hero.title`, whose `<br>`
 * chunks are the four beats below; the /roblox hero's three beats come from
 * `roblox.hero.title` the same way. The colour chunks are deliberately dropped —
 * a type comparison in three colours is a colour comparison.
 *
 * `liveClasses` is quoted verbatim from the component so the specimen and the
 * prose describing it cannot disagree.
 */
type Ps2pSite = {
  lines: readonly string[];
  liveClasses: string;
  specimens: readonly { caption: string; className: string }[];
};

/**
 * The matching rule every Space Mono row below follows, stated once here and
 * restated in prose on the faces slide.
 *
 * Press Start 2P advances exactly one em per character; Space Mono advances
 * about 0.6. So a string keeps its **line footprint** across the swap only at
 * roughly 1.67x the font size, and that is the size each row is drawn at — the
 * footprint is what the existing layout has room for, and it is the number a
 * swap has to survive. The eye reads the two faces as closer than that (their
 * cap heights are far nearer than their advances), which is exactly why the
 * gamer greeting's draft raises the size by 1.2x rather than 1.67x and buys the
 * line back as slack; that trade is slide 9's whole subject.
 */
const PS2P_SITES: Record<
  | "home"
  | "greeting"
  | "roblox"
  | "profile"
  | "callEnded"
  | "allClear",
  Ps2pSite
> = {
  home: {
    lines: ["Where", "Screen Time", "Becomes", "Quality Time"],
    liveClasses: "font-display text-2xl font-bold tracking-tight md:text-6xl",
    specimens: [
      {
        caption: "Today — Press Start 2P, text-6xl (the wide-screen size)",
        className: "font-display text-6xl font-bold tracking-tight",
      },
      {
        caption: "Space Mono, text-8xl — the footprint-matched size",
        className: "font-brand-mono text-8xl font-bold",
      },
      {
        caption: "Poppins bold, text-6xl — the app face at the heading's own size",
        className: "font-sans text-6xl font-bold tracking-tight",
      },
    ],
  },
  greeting: {
    lines: ["Welcome, Aino!"],
    liveClasses: "font-display text-xl md:text-3xl (font-bold text-primary)",
    specimens: [
      {
        caption: "Today — Press Start 2P, text-3xl (the wide-screen size)",
        className: "font-display text-3xl font-bold",
      },
      {
        caption: "Space Mono, text-4xl — as drafted",
        className: "font-brand-mono text-4xl font-bold",
      },
      {
        caption: "Space Mono, text-5xl — the footprint-matched size",
        className: "font-brand-mono text-5xl font-bold",
      },
      {
        caption: "Poppins bold, text-3xl",
        className: "font-sans text-3xl font-bold",
      },
    ],
  },
  roblox: {
    lines: ["Build It", "Play It", "Own It"],
    liveClasses:
      "font-display font-bold leading-snug text-2xl sm:text-4xl lg:text-5xl xl:text-6xl",
    specimens: [
      {
        caption:
          "Today — Press Start 2P, text-6xl (English copy at xl; French drops a scale)",
        className: "font-display text-6xl font-bold leading-snug",
      },
      {
        caption: "Space Mono, text-8xl — the footprint-matched size",
        className: "font-brand-mono text-8xl font-bold leading-snug",
      },
      {
        caption: "Poppins bold, text-6xl",
        className: "font-sans text-6xl font-bold leading-snug",
      },
    ],
  },
  profile: {
    lines: ["SOG"],
    liveClasses: "font-display text-xl font-bold text-primary",
    specimens: [
      {
        caption: "Today — Press Start 2P, text-xl",
        className: "font-display text-xl font-bold text-primary",
      },
      {
        caption: "Space Mono, text-3xl — the footprint-matched size",
        className: "font-brand-mono text-3xl font-bold text-primary",
      },
      {
        caption: "Poppins bold, text-xl",
        className: "font-sans text-xl font-bold text-primary",
      },
    ],
  },
  callEnded: {
    lines: ["Where", "Screen Time", "Becomes", "Quality Time"],
    liveClasses:
      "font-display text-2xl font-bold leading-tight tracking-tight md:text-3xl",
    specimens: [
      {
        caption: "Today — Press Start 2P, text-3xl (the wide-screen size)",
        className: "font-display text-3xl font-bold leading-tight tracking-tight",
      },
      {
        caption: "Space Mono, text-5xl — the footprint-matched size",
        className: "font-brand-mono text-5xl font-bold leading-tight",
      },
      {
        caption: "Poppins bold, text-3xl",
        className: "font-sans text-3xl font-bold leading-tight tracking-tight",
      },
    ],
  },
  allClear: {
    lines: ["All clear"],
    liveClasses:
      "font-display text-sm leading-relaxed tracking-normal text-primary sm:text-base",
    specimens: [
      {
        caption: "Today — Press Start 2P, text-base (the wide-screen size)",
        className:
          "font-display text-base leading-relaxed tracking-normal text-primary",
      },
      {
        caption: "Space Mono, text-2xl — the footprint-matched size",
        className: "font-brand-mono text-2xl font-bold text-primary",
      },
      {
        caption: "Poppins bold, text-base",
        className: "font-sans text-base font-bold text-primary",
      },
    ],
  },
};

/** The three loaded faces, one line each, at three sizes. */
const FACE_SPECIMEN_SAMPLE = "Clubs, camps and events";

const FACE_ROWS: readonly {
  name: string;
  token: string;
  role: string;
  className: string;
}[] = [
  {
    name: "Poppins",
    token: "--font-sans",
    role: "The app face. Body copy and every heading not claimed by a display variable. Four drawn weights: 400, 500, 600, 700.",
    className: "font-sans",
  },
  {
    name: "Space Mono",
    token: "--font-brand-mono",
    role: "Sanctioned by the Guidebook, which names in-platform UI as its first use. Two drawn weights: 400 and 700. Rendered today only by this page, the style guide and the gamer-dashboard draft scenario — no live route draws it.",
    className: "font-brand-mono",
  },
  {
    name: "Press Start 2P",
    token: "--font-display",
    role: "The rare-use display face, an owner-approved exception rather than a Guidebook face. One drawn weight, 400 — its bold and semibold are synthesised by the browser, not drawn.",
    className: "font-display",
  },
];

const FACE_SIZES: readonly { caption: string; className: string }[] = [
  { caption: "Display — 30px / 700", className: "text-3xl font-bold" },
  { caption: "Heading — 18px / 600", className: "text-lg font-semibold" },
  { caption: "Body — 14px / 400", className: "text-sm" },
];

/* ------------------------------------------------------------------ */
/*  Slide 9 — the greeting at the floor                                */
/* ------------------------------------------------------------------ */

/**
 * The greeting line in both faces at both of their sizes.
 *
 * Sizes are written out one per row rather than left to a `md:` breakpoint on
 * purpose: a breakpoint reads the browser window, so inside a 312px box on a
 * wide screen it would quietly show the wide size and call it the phone.
 *
 * 312px, not 360: the gamer dashboard's shell is `container p-6`, and the
 * container is full-width below `sm`, so 360px of viewport is 312px of content.
 * The width sits on its own element with the demo's border and padding on a
 * wrapper outside it — Tailwind sets `box-sizing: border-box`, so a single
 * element carrying both would be a 286px content box and would wrap earlier than
 * a real phone does.
 */
const GREETING_SPECIMENS: readonly {
  caption: string;
  text: string;
  className: string;
  floor: boolean;
}[] = [
  {
    caption: "Today — Press Start 2P at the 360px floor (text-xl)",
    text: "Welcome, Aino!",
    className: "font-display text-xl",
    floor: true,
  },
  {
    caption: "Today — Press Start 2P at the 360px floor, in Finnish",
    text: "Tervetuloa, Aino!",
    className: "font-display text-xl",
    floor: true,
  },
  {
    caption: "Draft — Space Mono at the 360px floor (text-2xl)",
    text: "Welcome, Aino!",
    className: "font-brand-mono text-2xl",
    floor: true,
  },
  {
    caption: "Draft — Space Mono at the 360px floor, in Finnish",
    text: "Tervetuloa, Aino!",
    className: "font-brand-mono text-2xl",
    floor: true,
  },
  {
    caption: "Today — Press Start 2P on a wide screen (text-3xl)",
    text: "Welcome, Aino!",
    className: "font-display text-3xl",
    floor: false,
  },
  {
    caption: "Draft — Space Mono on a wide screen, as drafted (text-4xl)",
    text: "Welcome, Aino!",
    className: "font-brand-mono text-4xl",
    floor: false,
  },
  {
    caption:
      "Draft — Space Mono on a wide screen, the larger option (text-5xl), roughly today's footprint",
    text: "Welcome, Aino!",
    className: "font-brand-mono text-5xl",
    floor: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 10 — CTA type                                                */
/* ------------------------------------------------------------------ */

/**
 * The button shape the CTA samples wear — the real variant recipe at its default
 * size, minus the type classes, which are the variable.
 *
 * **Written out rather than called for.** The colour deck's button slide quotes
 * a recounted blast radius per variant, and a review aid that adds call sites to
 * the numbers it asks a decision about would be arguing for the wrong decision.
 * These are inert spans at rest; the style guide draws every state.
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
    name: "Secondary on dark — proposed",
    className:
      "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground/10",
  },
  {
    name: "Third tier A — ghost as today",
    className: "hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier B — quiet 1px border",
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
 * The candidates the plan named for Space Mono beyond the greeting. **Nothing
 * here is drafted** — this is a list to green-light or park, and building any of
 * it before the greeting is ruled on would be drawing a house on a foundation
 * nobody has signed off.
 */
const MONO_CANDIDATES: readonly {
  surface: string;
  what: string;
  argument: string;
  against: string;
}[] = [
  {
    surface: "Voice-room chrome",
    what: "Zone names on the zone cards, and the room's title row",
    argument:
      "The most in-world surface the platform has — a child is standing somewhere inside Sogverse rather than reading a page about it, which is the register the Guidebook names for this face.",
    against:
      "A zone name is a moderator-authored string of up to 40 characters in any locale, and a wide monospace face is the worst one to hand an unbounded label at a card's width.",
  },
  {
    surface: "Badge labels",
    what: "Role badges, status chips, the Live badge",
    argument:
      "Short, fixed, uppercase-adjacent strings are what a monospace face flatters, and badges are the app's most repeated small element.",
    against:
      "They are the most repeated small element, so a face change there is the least rare use in the product — and the colour grammar is already moving these. Two changes at once on one element means neither can be judged.",
  },
  {
    surface: "Gamer dashboard section headings",
    what: "Clubs, Camps, Events, Help",
    argument:
      "The greeting directly above them would be Space Mono, and a page whose hero line is in one face and whose section headings are in another has two voices.",
    against:
      "The counter-argument is the same fact read the other way: the greeting is a hero, the headings are structure, and Poppins is what carries structure everywhere else in the product.",
  },
  {
    surface: "Yty-Points and Yty-Level figures",
    what: "The numerals themselves, wherever they are shown",
    argument:
      "A score is the one thing in this product that is genuinely a game artifact, and a monospace face keeps digit columns from reflowing as a figure changes.",
    against:
      "There is no surface drawing these today, so it is a placement for a feature rather than for a page.",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassTypographyPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
          Temporary
        </div>
        <p className="max-w-prose text-sm text-foreground">
          Temporary review aid for the brand design pass — this page is deleted
          before merge. It is in no sidebar and no index; it exists so the
          typography half of the pass can be ruled on on its own.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Brand design pass — typography</h1>
        <p className="max-w-prose text-muted-foreground">
          Twelve slides. Which faces the platform speaks in, and where. Split out
          of the colour walkthrough because none of these rulings waits on a
          colour decision — the colour deck is at{" "}
          <DeckLink href="/admin/design-pass-walkthrough">
            /admin/design-pass-walkthrough
          </DeckLink>{" "}
          and no longer carries type.
        </p>
      </div>

      <nav className="space-y-3 rounded-lg border p-4">
        <Marker>Slides</Marker>
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
      <Slide id="context">
        <Prose>
          The question, in one line:{" "}
          <strong className="font-semibold text-foreground">
            which faces does this platform speak in, and where does each one get
            to speak?
          </strong>{" "}
          Three faces are loaded. One of them does almost everything, one is
          sanctioned and says nothing at all yet, and one is an approved exception
          scattered across six surfaces that were each decided alone. This page
          settles the third and gives the second a job.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Already decided — not under review</Marker>
          <ul className="max-w-prose list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">
                Poppins is the app face.
              </strong>{" "}
              Body copy and every heading not claimed by a display variable. That
              is the Guidebook&rsquo;s, and nothing below reopens it.
            </li>
            <li>
              <strong className="font-semibold text-foreground">
                Space Mono is reached as font-brand-mono, not font-mono.
              </strong>{" "}
              A settled naming decision rather than a proposal:
              Tailwind&rsquo;s <code>font-mono</code> is already spent on machine
              text — ids, tokens, code — and a brand display face answering to
              that name would get applied by anyone who merely wanted a monospace.
            </li>
            <li>
              <strong className="font-semibold text-foreground">
                Headings are sentence case.
              </strong>{" "}
              Codified in the repo already: proper nouns keep their capitals and
              nothing else does, and caps survive only on furniture — eyebrows,
              pills, field labels, table headers. Every specimen below obeys it.
            </li>
            <li>
              <strong className="font-semibold text-foreground">
                Press Start 2P is rare-use by your own ruling.
              </strong>{" "}
              That ruling is the yardstick the six site slides are measured
              against, not something they re-decide.
            </li>
          </ul>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Under review here</Marker>
          <ul className="max-w-prose list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              The six Press Start 2P placements, one decision each — keep, swap to
              Space Mono, or drop.
            </li>
            <li>
              Space Mono&rsquo;s arrival: the gamer greeting is the drafted
              placement, and how much further the face reaches is slide 11.
            </li>
            <li>The greeting&rsquo;s size, which the face swap forces.</li>
            <li>CTA type: today&rsquo;s 14px / 500, or the Guidebook&rsquo;s 16px / 600.</li>
          </ul>
        </div>

        <NoRuling>
          Context. The first ruling is on slide 3 — and every slide from 3 to 8
          asks exactly one, about exactly one surface.
        </NoRuling>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="faces">
        <Prose>
          The three loaded faces, one string through all of them at three sizes.
          This comparison has until now only been possible from memory: Poppins is
          everywhere, Press Start 2P is on six scattered surfaces, and Space Mono
          is on none. Dancing Script is deliberately absent — it draws a typed
          signature and nothing else, so it is not a candidate for a heading and
          putting it in a comparison would imply it is.
        </Prose>

        <div className="grid gap-6 md:grid-cols-3">
          {FACE_ROWS.map((face) => (
            <div key={face.name} className="min-w-0 space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  {face.name}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {face.token}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {face.role}
                </p>
              </div>
              {FACE_SIZES.map((size) => (
                <div key={size.caption} className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">
                    {size.caption}
                  </div>
                  <p
                    className={cn(
                      face.className,
                      size.className,
                      "break-words",
                    )}
                  >
                    {FACE_SPECIMEN_SAMPLE}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        <Prose>
          <strong className="font-semibold text-foreground">
            One weight, and the bold you are looking at is not drawn.
          </strong>{" "}
          Press Start 2P ships a single weight, 400, so its bold and semibold rows
          above are synthesised by the browser — the glyphs are smeared thicker
          rather than redrawn, which on a pixel face is the one kind of blur it
          cannot absorb. Poppins and Space Mono draw theirs. That is not an
          argument against the face; it is a reason every Press Start 2P placement
          should be large, because the synthesis is invisible at hero size and
          mushy at 14px.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>How the Space Mono rows below are sized</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              Press Start 2P advances exactly one em per character; Space Mono
              advances about 0.6. So the same words keep their{" "}
              <em>line footprint</em> across a swap only at roughly 1.67x the font
              size, and that is the size every Space Mono specimen on the six site
              slides is drawn at — the footprint is what the existing layout has
              room for, and it is the number a swap has to survive.
            </p>
            <p>
              The eye reads the two faces as much closer than that, because their
              cap heights are far nearer than their advances. Which is exactly why
              the gamer greeting&rsquo;s draft raises the size by 1.2x rather than
              1.67x and pockets the difference as slack — a line that wraps in
              Finnish today stops wrapping. That trade is slide 9&rsquo;s whole
              subject.
            </p>
          </div>
        </div>

        <p className="text-xs">
          <DeckLink href="/admin/ui-components#type-faces-specimens">
            Open the specimens in the style guide — the permanent home for this
            comparison, which outlives this page
          </DeckLink>
        </p>

        <NoRuling>
          Context for the six slides that follow. The faces themselves are loaded
          and sanctioned; what is open is where each one speaks.
        </NoRuling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="site-home">
        <Prose>
          The public home page&rsquo;s <code>h1</code> — the vision statement, set
          in the pixel face at full size, centred on the hero. This is the
          flagship arcade moment and the placement the rare-use ruling exists to
          protect: a stranger meets it once, large, on the one page that has to
          have personality before it has anything else.
        </Prose>

        <div className="space-y-4">
          <Marker>The real heading, in three faces</Marker>
          {PS2P_SITES.home.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.home.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.home.liveClasses}</code>. The four beats
          are the English message&rsquo;s own line breaks; its two coloured chunks
          are dropped here, because a type comparison in three colours is a colour
          comparison.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — keep</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            Keep Press Start 2P. Every argument that moves the greeting on slide 4
            points the other way here: this line is met once rather than daily, it
            is set at 60px where the synthesised bold is invisible, and it is the
            single placement that makes the face a special effect rather than a
            house face. The Space Mono row above is what a swap would cost — a
            wider, quieter line that reads as a well-set website rather than as
            this company.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>One finding, while you are here</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            This heading carries <code>tracking-tight</code>, and so does the
            call-ended screen on slide 7. The /roblox hero on slide 5 deliberately
            does not, and says why in its own comment: negative letter-spacing
            smudges pixel glyphs into their neighbours. The admin all-clear on
            slide 8 goes further and explicitly cancels the tight tracking its card
            title would otherwise inherit. So the codebase already holds the
            argument and two surfaces are on the wrong side of it. At 60px it is
            −1.5px per glyph, which is visible on a face whose whole appeal is
            that its edges are square.
          </p>
        </div>

        <p className="text-xs">
          <DeckLink href="/">Open the live home page</DeckLink>
        </p>

        <Ruling>
          <p>Home hero: keep Press Start 2P, swap it, or drop it.</p>
          <p>
            And separately, on the pixel face&rsquo;s tracking: drop{" "}
            <code>tracking-tight</code> from this heading and from the call-ended
            screen, matching what /roblox and the admin all-clear already do — or
            leave both as they are.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="site-greeting">
        <Prose>
          The gamer dashboard&rsquo;s greeting — the line a child meets at the top
          of their own My SOG, every visit, with their own name in it. This is the
          one site the draft moves, and the one that fails the rare-use test
          hardest: the same child reads this exact line on every single visit,
          which is what a house face is, not what a special effect is.
        </Prose>

        <div className="space-y-4">
          <Marker>The real heading, in three faces</Marker>
          {PS2P_SITES.greeting.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.greeting.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.greeting.liveClasses}</code>. Two Space
          Mono rows rather than one, because the size is a second ruling and slide
          9 draws it at the 360px floor where it is actually decided.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — swap to Space Mono</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            Swap. Space Mono is loaded, sanctioned by the Guidebook, and placed
            nowhere — and the Guidebook names in-platform UI as its first use. This
            platform is that. The swap also buys a real defect back: at 360px in
            Finnish, today&rsquo;s pixel face wraps this line and Space Mono does
            not. It is the only one of the six sites where keeping the face costs
            something a reader can feel.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <DeckLink href="/preview/gamer-dashboard/typical">
            Open the page as it ships
          </DeckLink>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            Open the same page with the swap in place
          </DeckLink>
        </div>
        <Prose>
          The draft scenario carries the colour palette as well as the face, so
          the two links differ in both. Worth opening in a phone-sized window: a
          breakpoint reads the browser, not a box, so the wrapping only tells the
          truth at a narrow viewport.
        </Prose>

        <Ruling>
          <p>Gamer greeting: approve the swap from Press Start 2P to Space Mono.</p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="site-roblox">
        <Prose>
          The /roblox programme hero&rsquo;s three-beat slogan, set flush left
          beside the approved three-way partner lockup from <code>md</code> up.
        </Prose>

        <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
            Partner constraint — this one is explicitly yours
          </div>
          <div className="max-w-prose space-y-2 text-sm text-foreground">
            <p>
              This heading sits directly above the Roblox lockup, and
              Roblox&rsquo;s approval covers{" "}
              <em>the placement as it was given</em> — not the mark in the
              abstract. Changing the typeface here changes the appearance of the
              approved placement, so it ships only with your explicit go, and
              possibly with partner re-approval if you judge one is needed. Meeting
              the mark&rsquo;s own usage constraints is not approval and does not
              substitute for it.
            </p>
            <p>
              There is a second reason to leave it alone that has nothing to do
              with the partner. The hero&rsquo;s size arithmetic{" "}
              <em>derives from this face</em>: the component measures whether any
              beat exceeds eight characters and drops to a smaller scale if one
              does, and that test is only valid because Press Start 2P advances
              exactly one em per character, so a beat&rsquo;s width is literally
              characters times font-size. Space Mono at 0.6em would make the
              threshold wrong in every locale at once, and French — whose
              &ldquo;Construisez&rdquo; is the eleven-character beat that forces
              the smaller scale — is the one it would break first.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Marker>The real heading, in three faces</Marker>
          {PS2P_SITES.roblox.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.roblox.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.roblox.liveClasses}</code>. The specimen
          is the line alone; what cannot be judged here is the thing that actually
          matters on this slide — how the slogan sits against the partner marks
          beside it — so the link is the answer rather than a decoration.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — keep, and it is your call</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            Keep. Two independent reasons point the same way — the approval covers
            this placement, and the layout&rsquo;s own arithmetic is built on the
            face&rsquo;s one-em advance — and neither is a taste argument. This is
            also arguably a second flagship rare use rather than a routine one: a
            programme landing page a stranger arrives on, not a surface anyone
            lives in.
          </p>
        </div>

        <p className="text-xs">
          <DeckLink href="/roblox">
            Open the live /roblox hero, with the lockup beside it
          </DeckLink>
        </p>

        <Ruling>
          <p>
            /roblox hero: confirm keep. If you want it moved, it goes back to
            Roblox before it ships, and the hero&rsquo;s size arithmetic is
            rewritten in the same change.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="site-profile">
        <Prose>
          The profile-select header&rsquo;s mark: three letters, in the pixel face,
          beside the platform name in Poppins. It is deliberately non-clickable —
          sending a viewer home would yank them out of the picker mid-decision.
        </Prose>

        <div className="space-y-4">
          <Marker>The real mark, in three faces</Marker>
          {PS2P_SITES.profile.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.profile.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.profile.liveClasses}</code>. Drawn as
          classed type rather than by mounting the real header, which is a sticky,
          full-width bar with a backdrop blur — embedding one mid-page would put a
          second sticky header over this deck&rsquo;s own. The link is the honest
          view of it.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — keep</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              Keep, and on a different ground from the other five.{" "}
              <strong className="font-semibold text-foreground">
                This is not a heading.
              </strong>{" "}
              It draws the letters SOG — a wordmark — and the rare-use ruling is
              about headings reaching for a display face, not about how a mark is
              lettered. The Poppins row above is the argument in one line: in the
              app face it stops being a mark and becomes the word &ldquo;SOG&rdquo;
              in bold.
            </p>
            <p>
              Worth naming because it points at a real question this page does not
              answer: the sanctioned small mark is the monogram badge, which is a
              drawn asset rather than three letters in a typeface. Whether this
              header should be lettering the mark at all, instead of drawing it, is
              a brand-assets question — flagged here, not decided here.
            </p>
          </div>
        </div>

        <p className="text-xs">
          <DeckLink href="/select-profile">
            Open the profile picker — the header is what to look at; an admin
            account has no gamers to show below it
          </DeckLink>
        </p>

        <Ruling>
          <p>Profile-select wordmark: confirm keep.</p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="site-call-ended">
        <Prose>
          The screen a participant lands on after an instant voice call wraps up.
          It closes with the brand tagline, and it does not merely happen to use
          the same words as the home hero — it reads{" "}
          <code>home.hero.title</code> directly, so the copy and the treatment stay
          in step by construction.
        </Prose>

        <div className="space-y-4">
          <Marker>The real heading, in three faces</Marker>
          {PS2P_SITES.callEnded.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.callEnded.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.callEnded.liveClasses}</code> — the home
          hero&rsquo;s treatment at half the size, inside a card. Drawn as classed
          type rather than by mounting the screen, which wants a room to have ended
          and a server-rendered copyright slot threaded into it.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — keep</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            Keep, and keep it{" "}
            <em>because slide 3 keeps</em>. This is a quotation of the home hero —
            same words, same face, same colour treatment — so its face is not an
            independent decision at all. It follows slide 3 in whichever direction
            slide 3 goes; changing one without the other breaks the quotation and
            leaves a reader with two versions of the same sentence.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>How to see it, since it has no URL</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            There is no standalone route: it is a phase of the instant-room state
            machine, reached by creating a room from{" "}
            <DeckLink href="/admin/tools">/admin/tools</DeckLink>, joining it, and
            leaving. That is a real call for one line of type, so the specimen
            above is meant to carry this decision on its own — and it can, because
            the only thing the screen adds around the line is a card.
          </p>
        </div>

        <Ruling>
          <p>
            Call-ended screen: confirm it follows the home hero, whatever slide 3
            decides. A separate answer here is available but has to be argued for.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 8 */}
      <Slide id="site-all-clear">
        <Prose>
          The admin dashboard&rsquo;s needs-attention panel, in its empty state.
          The pixel wordmark takes the slot the panel&rsquo;s title held, and a
          pixel trophy rides in the right-packed group opposite it. Admin-only, so
          nothing outside the building ever meets it.
        </Prose>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <Marker>The real component, with no products needing attention</Marker>
            <span className="shrink-0 text-xs text-muted-foreground">
              Rendered here, not pictured
            </span>
          </div>
          <NeedsAttentionPanel products={[]} />
        </div>

        <Prose>
          That is the actual panel — the page&rsquo;s own component handed an empty
          list, which is exactly the condition the live dashboard renders it under.
          The sprite is drawn as markup in the page&rsquo;s own colour tokens
          rather than shipped as an image, which is why it is the same gold as the
          wordmark beside it and would follow a token change.
        </Prose>

        <div className="space-y-4">
          <Marker>The same title, in three faces</Marker>
          {PS2P_SITES.allClear.specimens.map((specimen) => (
            <Specimen
              key={specimen.caption}
              caption={specimen.caption}
              className={specimen.className}
              lines={PS2P_SITES.allClear.lines}
            />
          ))}
        </div>

        <Prose>
          Live classes: <code>{PS2P_SITES.allClear.liveClasses}</code>. Note{" "}
          <code>tracking-normal</code>, which is cancelling the{" "}
          <code>tracking-tight</code> the card title would otherwise inherit — the
          same fix slide 3 asks for on the home hero.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>Recommendation — keep, or cut with its trophy</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            The panel above is the argument, which is why it is rendered rather
            than described:{" "}
            <strong className="font-semibold text-foreground">
              the face and the sprite are two halves of one joke
            </strong>
            , and neither half works alone. A pixel trophy beside a Poppins title
            is a sticker on a form; a pixel title with no sprite is a heading in a
            costume. So this is one decision about two elements — keep both, or cut
            both and let the empty state be a plain line — and it is the one site
            of the six where &ldquo;drop&rdquo; is a live option rather than a
            formality. Smallest possible stake: this is 16px, admin-only, and it is
            also the one placement where the synthesised bold would show, which is
            why the live component asks for no bold at all.
          </p>
        </div>

        <p className="text-xs">
          <DeckLink href="/admin">
            Open the live admin dashboard — you will see the all-clear only if
            nothing needs attention
          </DeckLink>
        </p>

        <Ruling>
          <p>
            Admin all-clear: keep the pixel wordmark and the trophy, or cut both
            together. Not one without the other.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 9 */}
      <Slide id="greeting-size">
        <Prose>
          The face swap on slide 4 forces a second decision, because the two faces
          are not interchangeable at one size. Press Start 2P advances a full em
          per character and Space Mono about 0.6, so keeping today&rsquo;s numbers
          would shrink the greeting by two fifths. The draft raises them: today is{" "}
          <code>text-xl</code> rising to <code>text-3xl</code> on wide screens, the
          draft is <code>text-2xl</code> rising to <code>text-4xl</code>.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>The 360px arithmetic, briefly</Marker>
          <p className="max-w-prose text-sm text-muted-foreground">
            The gamer dashboard is a mobile-first surface, so it is judged at the
            360px Android floor. The shell is <code>container p-6</code>, which is
            312px of content there, and Finnish sets the longest first word —
            &ldquo;Tervetuloa,&rdquo; at eleven characters, against French&rsquo;s
            &ldquo;Bienvenue,&rdquo;. At 20px Press Start 2P that whole greeting is
            about 340px and wraps; at 24px Space Mono it is about 245px for a
            typical first name and stays on one line. A long name (Aleksanteri)
            wraps under either, at the space, which <code>break-words</code>{" "}
            already handles.
          </p>
        </div>

        <div className="space-y-3">
          <Marker>The greeting line, in each face at each size</Marker>
          <div className="space-y-4">
            {GREETING_SPECIMENS.map((row) => (
              <div key={row.caption} className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {row.caption}
                </div>
                <div className="w-fit rounded-lg border bg-background p-3">
                  <div className={row.floor ? "w-[312px]" : "w-full"}>
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
          <Prose>
            The narrow box is 312px — the content width a 360px phone gives this
            page, not the viewport width — which is what makes the wrapping honest.
            The sizes are written out one per row rather than left to a breakpoint,
            because a breakpoint would read this browser window and show the wide
            size inside a narrow box. Finnish is set beside English because it is
            the longest of the five locales and the one that wraps first.
          </Prose>
        </div>

        <Prose>
          <strong className="font-semibold text-foreground">
            The wide-screen size is the open half.
          </strong>{" "}
          <code>text-4xl</code> as drafted is the optical match — it looks the same
          size as today. <code>text-5xl</code> is the footprint match — it occupies
          roughly today&rsquo;s line width, so the page&rsquo;s vertical rhythm is
          unchanged and the greeting keeps its weight as this page&rsquo;s hero.
          The floor size is not in question either way: 24px is what buys the
          Finnish line back, and the wide size is independent of it.
        </Prose>

        <div className="flex flex-wrap gap-4 text-xs">
          <DeckLink href="/preview/gamer-dashboard/typical">
            Open the page as it ships
          </DeckLink>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            Open the same page under the draft
          </DeckLink>
          <DeckLink href="/admin/ui-components#type-faces-the-gamer-greeting-at-the-360px-floor">
            Open the floor comparison in the style guide
          </DeckLink>
        </div>

        <Ruling>
          <p>
            The greeting&rsquo;s wide-screen size: <code>text-4xl</code> as
            drafted, or <code>text-5xl</code> to keep today&rsquo;s footprint.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 10 */}
      <Slide id="cta-type">
        <Prose>
          The Guidebook specs CTA type at 16px / SemiBold 600. Every button in the
          app wears 14px / Medium 500 today. That is a typography decision the
          button work has been carrying as a passenger, so it is settled here
          rather than there — the colour and shape of the button set is the colour
          deck&rsquo;s.
        </Prose>

        <div className="space-y-3">
          <Marker>The proposed set, at both types</Marker>
          <div className="overflow-x-auto">
            <div className="grid min-w-[36rem] grid-cols-[minmax(14rem,auto)_repeat(2,minmax(10rem,1fr))] items-center gap-x-6 gap-y-3">
              <div />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Today — 14px / 500
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Guidebook — 16px / 600
              </div>
              {CTA_ROWS.map((row) => (
                <Fragment key={row.name}>
                  <div className="text-sm text-foreground">{row.name}</div>
                  <div>
                    <span
                      className={cn(CTA_SHAPE, CTA_TYPE_TODAY, row.className)}
                    >
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
        </div>

        <Prose>
          These are inert spans wearing the variants&rsquo; own class strings, at
          rest. The buttons are not real ones on purpose: the colour deck quotes a
          recounted call-site total per variant, and a review aid that adds call
          sites to the number it asks a decision about would be arguing for the
          wrong decision.
        </Prose>

        <Prose>
          What the change actually costs, since it is not free: the button height
          is fixed at 40px, so 16px type inside it leaves less breathing room above
          and below the label, and the label grows about 14% wider — which matters
          on the narrowest strips, where the 360px arithmetic is done per locale
          and French sets the longest words. Nothing in the app is currently at
          that edge, but the next tight row is measured against 16px rather than
          14px if this lands.
        </Prose>

        <p className="text-xs">
          <DeckLink href="/admin/ui-components#button-cta-type-today-beside-guidebook">
            Open the full table in the style guide — every proposed variant, both
            types, side by side
          </DeckLink>
        </p>

        <Ruling>
          <p>CTA type: today&rsquo;s 14px / 500, or the Guidebook&rsquo;s 16px / 600.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 11 */}
      <Slide id="mono-reach">
        <Prose>
          If the greeting swap lands, Space Mono has exactly one placement. The
          Guidebook names in-platform UI as the face&rsquo;s use, which is broader
          than one heading — so the question is how much further it should reach,
          and the answer decides whether it is a face with a job or a face with an
          exception.
        </Prose>

        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Nothing below is drafted
          </div>
          <p className="max-w-prose text-sm text-foreground">
            No scenario draws any of these and no class has been written for them.
            This slide is a list to green-light exploring or to park — building any
            of it before the greeting is ruled on would be putting a house on a
            foundation nobody has signed off. Say which ones are worth a draft, and
            they get drafted in fixtures like everything else.
          </p>
        </div>

        <DeckTable head={["Surface", "What would move", "The case for", "The case against"]}>
          {MONO_CANDIDATES.map((row) => (
            <tr key={row.surface}>
              <Cell>{row.surface}</Cell>
              <Cell muted>{row.what}</Cell>
              <Cell muted>{row.argument}</Cell>
              <Cell muted>{row.against}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          <strong className="font-semibold text-foreground">
            The recommendation is to park all four for now and place the greeting
            alone.
          </strong>{" "}
          A face earns its second placement by the first one working, and the
          greeting is the only one of the five where a real reader gets a real
          benefit today. Two of the four also collide with work already in flight —
          badge labels are being recoloured by the grammar, and the gamer
          dashboard&rsquo;s section headings sit directly under the greeting — so
          drafting them now would mean judging two changes on one element at once.
        </Prose>

        <Ruling>
          <p>
            Space Mono&rsquo;s reach: park all four and place the greeting alone,
            or name the ones worth drafting.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 12 */}
      <Slide id="recap">
        <Prose>
          Ten rulings, typography only, in the order they were asked. Any of them
          can come back as tune this rather than yes. The colour deck at{" "}
          <DeckLink href="/admin/design-pass-walkthrough">
            /admin/design-pass-walkthrough
          </DeckLink>{" "}
          carries its own eighteen and no longer overlaps with these.
        </Prose>

        <ol className="max-w-prose list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>
            Slide 3 — the home hero: keep Press Start 2P, swap it, or drop it.
          </li>
          <li>
            Slide 3 — the pixel face&rsquo;s tracking: drop{" "}
            <code>tracking-tight</code> from the home hero and the call-ended
            screen, or leave both.
          </li>
          <li>
            Slide 4 — the gamer greeting: approve the swap to Space Mono.
          </li>
          <li>
            Slide 5 — the /roblox hero: confirm keep, with the partner approval and
            the size arithmetic both riding on it.
          </li>
          <li>Slide 6 — the profile-select wordmark: confirm keep.</li>
          <li>
            Slide 7 — the call-ended screen: confirm it follows the home hero.
          </li>
          <li>
            Slide 8 — the admin all-clear: keep the pixel wordmark and its trophy,
            or cut both together.
          </li>
          <li>
            Slide 9 — the greeting&rsquo;s wide-screen size:{" "}
            <code>text-4xl</code> as drafted, or <code>text-5xl</code>.
          </li>
          <li>
            Slide 10 — CTA type: today&rsquo;s 14px / 500, or 16px / 600.
          </li>
          <li>
            Slide 11 — Space Mono&rsquo;s reach: park the four candidates, or name
            the ones worth drafting.
          </li>
        </ol>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>What happens on sign-off</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              The wiring phase applies the face decisions to the live surfaces, and
              each Press Start 2P site&rsquo;s outcome is recorded in the
              Guidebook deviations log&rsquo;s Press Start 2P entry — which is what
              makes &ldquo;rare and specialized&rdquo; a reviewable rule instead of
              a memory. If the greeting swap lands, Space Mono stops being a
              draft-only face and its font loading turns preload back on, because a
              live family-facing route will finally draw it.
            </p>
            <p>
              Then the scaffolding goes: the draft scenario&rsquo;s face axis, the
              greeting&rsquo;s two-row face map, and this page.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Feedback
          </div>
          <p className="max-w-prose text-sm text-foreground">
            Reply in the Claude session, referencing slide numbers. A slide can be
            answered with a change rather than a yes; the drafts are cheap to move
            while they are still fixtures.
          </p>
        </div>
      </Slide>
    </div>
  );
}

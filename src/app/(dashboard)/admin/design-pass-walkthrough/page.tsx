/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { YTY_ELEMENTS, ytyElementColor } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** A guided review deck for the brand palette and type design
 * pass, built so the owner can rule on the whole pass in one pass of one page
 * instead of opening a dozen preview scenes and holding the comparison in
 * memory. It is deleted from this branch before the wiring phase lands.
 *
 * Deliberately absent from the admin sidebar and from every index: this is not
 * a surface anybody navigates to, it is a link handed over once. The proxy
 * role-gates every path under `/admin` to the admin role, so reaching it by URL
 * is already gated without this page doing anything.
 *
 * **Before and after are real pages in same-origin iframes, not screenshots.**
 * Security headers allow self-framing (`X-Frame-Options: SAMEORIGIN`,
 * `frame-ancestors 'self'`, `frame-src 'self'`), and an iframe is its own
 * viewport — so a mobile surface framed at 360 CSS px hits the same Tailwind
 * breakpoints a phone does, which a 360px `<div>` on a wide page never would.
 * Desktop surfaces are framed at 1280 and CSS-scaled down to a picture, with a
 * full-size link beside them. Every frame is lazy, because each one is a whole
 * page render and there are several.
 *
 * The full-size links are plain anchors rather than `buttonVariants` ones on
 * purpose: slide 8 quotes the recounted blast radius of the `outline` variant,
 * and a review aid that inflates the number it asks a decision about would be
 * arguing for the wrong decision.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "context", title: "What this pass is, and how to read the deck" },
  { id: "palette-today", title: "Why the palette is wrong today" },
  { id: "strong-soft", title: "The strong and soft split" },
  { id: "home-yty", title: "Home Yty section" },
  { id: "gamer-floor", title: "Gamer dashboard at the 360 floor" },
  { id: "greeting-face", title: "The greeting face" },
  { id: "wit", title: "Wit, up close" },
  { id: "buttons", title: "Buttons" },
  { id: "faces", title: "Type faces, and every Press Start 2P site" },
  { id: "zones", title: "Voice-zone Yty tiles" },
  { id: "reach", title: "How far the palette reaches" },
  { id: "status-colours", title: "Status colours meet the brand palette" },
  { id: "recap", title: "Recap, and the decisions checklist" },
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

/* ------------------------------------------------------------------ */
/*  Frames                                                             */
/* ------------------------------------------------------------------ */

function FrameHeader({ label, src }: { label: string; src: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
        {label}
      </span>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Open full size
      </a>
    </div>
  );
}

/**
 * A mobile surface at the real floor: 360 CSS px, unscaled, scrollable. The
 * frame is its own viewport, so the page inside picks the same layout a phone
 * would — which is the whole reason this is an iframe and not a screenshot.
 */
function MobileFrame({
  label,
  src,
  height = 800,
}: {
  label: string;
  src: string;
  height?: number;
}) {
  return (
    <div className="space-y-2">
      <FrameHeader label={label} src={src} />
      <iframe
        src={src}
        title={label}
        loading="lazy"
        className="rounded-lg border bg-background"
        style={{ width: 360, height }}
      />
      <p className="text-[11px] text-muted-foreground">
        360 px wide, unscaled — the real mobile viewport. Scrolls.
      </p>
    </div>
  );
}

/**
 * A desktop surface at 1280, scaled down to a picture. `pointer-events-none`
 * is what makes it read as one: a half-scale page that could be clicked into
 * would be a trap, so interaction goes through the full-size link instead.
 */
function DesktopFrame({
  label,
  src,
  height,
  scale = 0.4,
  width = 1280,
}: {
  label: string;
  src: string;
  height: number;
  scale?: number;
  width?: number;
}) {
  return (
    <div className="space-y-2">
      <FrameHeader label={label} src={src} />
      <div
        className="overflow-hidden rounded-lg border bg-background"
        style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
      >
        <iframe
          src={src}
          title={label}
          loading="lazy"
          className="pointer-events-none border-0"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {width} px wide, drawn at {Math.round(scale * 100)}% — a picture, not a
        control.
      </p>
    </div>
  );
}

function FrameRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-6">{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Tables and swatches                                                */
/* ------------------------------------------------------------------ */

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

function Swatch({
  label,
  hex,
  className,
}: {
  label: string;
  hex: string;
  className: string;
}) {
  return (
    <div className="w-32 space-y-1.5">
      <div className={cn("h-14 w-full rounded-md border", className)} />
      <div className="text-xs text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hex}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */

/** The live tokens, each against the hue the brand actually fixes for it. */
const TODAY_TOKENS: readonly {
  element: string;
  brand: string;
  hex: string;
  renders: string;
}[] = [
  {
    element: "Harmony",
    brand: "Pink",
    hex: "#34d399",
    renders: "Green — which is Glow's family, not Harmony's",
  },
  {
    element: "Glow",
    brand: "Green",
    hex: "#fbbf24",
    renders: "Amber — the same family as the CTA amber, which it collides with",
  },
  {
    element: "Valor",
    brand: "Orange",
    hex: "#fb7185",
    renders: "Rose — which is Harmony's family, not Valor's",
  },
  { element: "Wit", brand: "Blue", hex: "#a78bfa", renders: "Violet" },
];

const CURRENT_SWATCHES: readonly { label: string; hex: string; className: string }[] =
  [
    { label: "Harmony (today)", hex: "#34d399", className: "bg-yty-harmony" },
    { label: "Glow (today)", hex: "#fbbf24", className: "bg-yty-glow" },
    { label: "Valor (today)", hex: "#fb7185", className: "bg-yty-valor" },
    { label: "Wit (today)", hex: "#a78bfa", className: "bg-yty-wit" },
  ];

const BRAND_SWATCHES: readonly { label: string; hex: string; className: string }[] =
  [
    {
      label: "Harmony strong",
      hex: "#F55B9A",
      className: "bg-yty-harmony-strong",
    },
    { label: "Harmony soft", hex: "#FA7FA3", className: "bg-yty-harmony-soft" },
    { label: "Glow strong", hex: "#1AB061", className: "bg-yty-glow-strong" },
    { label: "Glow soft", hex: "#6AC66B", className: "bg-yty-glow-soft" },
    { label: "Valor strong", hex: "#FD700D", className: "bg-yty-valor-strong" },
    { label: "Valor soft", hex: "#FF993D", className: "bg-yty-valor-soft" },
    { label: "Wit strong", hex: "#3A71DE", className: "bg-yty-wit-strong" },
    { label: "Wit soft", hex: "#4DB3F5", className: "bg-yty-wit-soft" },
  ];

/**
 * The card-ground column of `node scripts/yty-contrast.mjs`. The card
 * (`#1a1a1a`) is the lighter of the two grounds these pairings sit on, so its
 * numbers are the binding ones; the page ground is looser everywhere.
 */
const CONTRAST_ROWS: readonly {
  element: string;
  strongHex: string;
  strong: string;
  softHex: string;
  soft: string;
  zone: string;
}[] = [
  {
    element: "Harmony",
    strongHex: "#F55B9A",
    strong: "5.67:1",
    softHex: "#FA7FA3",
    soft: "7.15:1",
    zone: "6.32:1",
  },
  {
    element: "Glow",
    strongHex: "#1AB061",
    strong: "6.16:1",
    softHex: "#6AC66B",
    soft: "8.21:1",
    zone: "7.16:1",
  },
  {
    element: "Valor",
    strongHex: "#FD700D",
    strong: "6.22:1",
    softHex: "#FF993D",
    soft: "8.18:1",
    zone: "7.16:1",
  },
  {
    element: "Wit",
    strongHex: "#3A71DE",
    strong: "3.81:1",
    softHex: "#4DB3F5",
    soft: "7.53:1",
    zone: "6.84:1",
  },
];

const BUTTON_COUNTS: readonly {
  variant: string;
  count: string;
  note: string;
}[] = [
  {
    variant: "outline — today's 1px grey border",
    count: "61",
    note: "44 buttons plus 17 link anchors wearing the button's clothes",
  },
  {
    variant: "ghost — today's borderless quiet tier",
    count: "24",
    note: "all real buttons",
  },
  {
    variant: "secondary — today's violet fill",
    count: "1",
    note: "a single link anchor, and no real button anywhere",
  },
];

const PS2P_SITES: readonly {
  site: string;
  decision: string;
  why: string;
}[] = [
  {
    site: "Home page hero heading",
    decision: "Keep",
    why: "The flagship arcade moment, and the placement the rare-use ruling exists to protect. A stranger meets it once, at full size, on the page that has to have personality.",
  },
  {
    site: "Gamer dashboard greeting",
    decision: "Swap to Space Mono",
    why: "Slide 6. The same child reads this line on every visit, which is the opposite of rare; and in-platform UI is the Guidebook's first named use for Space Mono.",
  },
  {
    site: "Roblox programme hero",
    decision: "Keep — and explicitly your call",
    why: "It sits directly above the approved three-way Roblox lockup, so changing its face changes the appearance of the placement Roblox signed off, and would go back to them. Its size arithmetic also derives from the pixel face advancing exactly one em per character.",
  },
  {
    site: "Profile-select header wordmark",
    decision: "Keep",
    why: "It draws the letters SOG. That is a wordmark, not a heading, and the rare-use ruling is about headings reaching for a display face.",
  },
  {
    site: "Instant call — the ended screen",
    decision: "Keep",
    why: "It quotes the home hero's tagline, so it is quoting the home hero's face along with it. Changing one without the other breaks the quotation.",
  },
  {
    site: "Admin needs-attention, the all-clear",
    decision: "Keep, or cut with its trophy",
    why: "The pixel face and the pixel trophy beside it are two halves of one joke, and neither half works alone. Admin-only either way, so nothing outside the building sees it.",
  },
];

/**
 * The functional status tokens against the brand family each one now sits in.
 *
 * Hexes are what the browser resolves the HSL triples in globals.css to, and
 * the distances are CIE76 in Lab — a rough but honest "how far apart would a
 * person call these". Under about 25 is the range where two colours read as
 * two shades of one thing rather than two things.
 */
const STATUS_COLLISIONS: readonly {
  token: string;
  hex: string;
  against: string;
  againstHex: string;
  hue: string;
  distance: string;
}[] = [
  {
    token: "--info",
    hex: "#308CE8",
    against: "Wit strong",
    againstHex: "#3A71DE",
    hue: "210° vs 220°",
    distance: "17.5",
  },
  {
    token: "--info",
    hex: "#308CE8",
    against: "Wit soft",
    againstHex: "#4DB3F5",
    hue: "210° vs 204°",
    distance: "22.7",
  },
  {
    token: "--success",
    hex: "#2EB88A",
    against: "Glow strong",
    againstHex: "#1AB061",
    hue: "160° vs 148°",
    distance: "19.1",
  },
  {
    token: "--success",
    hex: "#2EB88A",
    against: "Glow soft",
    againstHex: "#6AC66B",
    hue: "160° vs 121°",
    distance: "24.7",
  },
  {
    token: "--warning",
    hex: "#E7B008",
    against: "Valor strong",
    againstHex: "#FD700D",
    hue: "45° vs 25°",
    distance: "43.9",
  },
  {
    token: "--destructive",
    hex: "#EF4343",
    against: "Harmony strong",
    againstHex: "#F55B9A",
    hue: "0° vs 335°",
    distance: "42.6",
  },
];

/** A swatch row: the status token, then the two brand variants beside it. */
const STATUS_SWATCH_ROWS: readonly {
  heading: string;
  swatches: readonly { label: string; hex: string; className: string }[];
}[] = [
  {
    heading: "One blue, or three?",
    swatches: [
      { label: "--info", hex: "#308CE8", className: "bg-info" },
      { label: "Wit strong", hex: "#3A71DE", className: "bg-yty-wit-strong" },
      { label: "Wit soft", hex: "#4DB3F5", className: "bg-yty-wit-soft" },
    ],
  },
  {
    heading: "One green, or three?",
    swatches: [
      { label: "--success", hex: "#2EB88A", className: "bg-success" },
      { label: "Glow strong", hex: "#1AB061", className: "bg-yty-glow-strong" },
      { label: "Glow soft", hex: "#6AC66B", className: "bg-yty-glow-soft" },
    ],
  },
];

/**
 * The same collision as the app actually draws it — the tinted chip shape both
 * halves already use, so the confusion is visible in context rather than as
 * squares. Left of each pair is a real status chip; right of it is the brand
 * family the draft would put beside it on the same screen.
 */
const STATUS_CHIPS: readonly {
  caption: string;
  status: { label: string; className: string };
  brand: { label: string; className: string };
}[] = [
  {
    caption: "Blue",
    status: {
      label: "Info notice",
      className: "border-info/40 bg-info/10 text-info",
    },
    brand: {
      label: "Wit — technology",
      className:
        "border-yty-wit-strong/40 bg-yty-wit-strong/10 text-yty-wit-soft",
    },
  },
  {
    caption: "Green",
    status: {
      label: "Payment succeeded",
      className: "border-success/40 bg-success/10 text-success",
    },
    brand: {
      label: "Glow — others",
      className:
        "border-yty-glow-strong/40 bg-yty-glow-strong/10 text-yty-glow-soft",
    },
  },
];

function StatusChip({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 7's four draft cards                                         */
/* ------------------------------------------------------------------ */

/**
 * One element as the draft draws it: soft on the glyph and every word, strong
 * on the wash and the edge. The four side by side is the only way the wit seam
 * is visible — on its own, a wit card looks fine.
 */
function DraftElementCard({
  element,
}: {
  element: (typeof YTY_ELEMENTS)[number];
}) {
  const color = ytyElementColor(element, "brand");
  const Icon = element.icon;

  return (
    <div
      className={cn(
        "w-52 space-y-2 rounded-lg border p-4",
        color.bg,
        color.border,
      )}
    >
      <Icon className={cn("h-7 w-7", color.accent)} aria-hidden />
      <div className={cn("text-base font-semibold", color.accent)}>
        {element.name}
      </div>
      <p className={cn("text-sm", color.accent)}>{element.description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassWalkthroughPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
          Temporary
        </div>
        <p className="max-w-prose text-sm text-foreground">
          Temporary review aid for the brand design pass — this page is deleted
          before merge. It is in no sidebar and no index; it exists so the whole
          pass can be ruled on in one sitting.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Brand design pass — walkthrough</h1>
        <p className="max-w-prose text-muted-foreground">
          Thirteen slides. Each one shows today beside the draft, says why the
          draft is what it is, and names the ruling it wants from you.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          The question this pass answers
        </div>
        <p className="max-w-prose text-lg font-semibold leading-snug text-foreground">
          Can Sogverse be as fun, colourful, bright and lively as the sog.gg
          marketing site while keeping the dark ground — all while adhering to
          the Guidebook?
        </p>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Every slide below is evidence toward that answer. The Guidebook does
          not stand in the way of it: its own colour-rationing rule welcomes the
          full palette on marketing, gamer, community and in-world surfaces, and
          caps liveliness only in the calm ring — billing, safety and legal —
          where amber stays the single accent on a quiet ground. The home page
          is a marketing surface, so it is where the answer is drawn.
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

      {/* ---------------------------------------------------------- 1 */}
      <Slide id="context">
        <Prose>
          This branch is the visual half of the Guidebook alignment: the
          Guidebook&rsquo;s Yty-Element colours, its button set and its display
          faces, interpreted on Sogverse&rsquo;s dark ground. Nothing live has
          moved. Every real route still renders exactly what it rendered before
          — the drafts live in preview scenes and in the UI Components style
          guide, which is what this deck walks you through.
        </Prose>
        <Prose>
          Rulings you have already made, carried into every slide below: the
          dark theme stays, so this is a dark interpretation of the Guidebook
          palette and not a white one; the Yty hues become the brand&rsquo;s
          exactly; and it is UI first, then wiring — nothing promotes to a live
          surface without your sign-off on these drafts.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>How to read the pictures</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              Every before and after below is the real page, live, in a frame —
              not a screenshot and not a mock. A frame is its own viewport, so a
              mobile surface framed at 360 px lays itself out the way it does on
              a phone; a 360 px box on a wide page would not.
            </p>
            <p>
              Mobile frames are unscaled and scroll. Desktop frames are drawn at
              1280 px and scaled down to a picture you cannot click into — use
              the full-size link beside each one to open the real page in a new
              tab.
            </p>
          </div>
        </div>

        <NoRuling>
          Context. The first ruling is on slide 3.
        </NoRuling>
      </Slide>

      {/* ---------------------------------------------------------- 2 */}
      <Slide id="palette-today">
        <Prose>
          The four Yty tokens the app ships today are raw Tailwind defaults that
          were never brand colours. The brand fixes Harmony pink, Glow green,
          Valor orange and Wit blue — and two of the stand-ins are effectively
          swapped: Harmony renders in Glow&rsquo;s family and Valor in
          Harmony&rsquo;s. The Glow stand-in is worse than wrong, because it is
          the same amber as the CTA, so the element and the primary button
          compete on any page carrying both.
        </Prose>

        <DeckTable
          head={["Element", "Brand hue", "Token today", "What that actually is"]}
        >
          {TODAY_TOKENS.map((row) => (
            <tr key={row.element}>
              <Cell>{row.element}</Cell>
              <Cell>{row.brand}</Cell>
              <Cell muted>{row.hex}</Cell>
              <Cell muted>{row.renders}</Cell>
            </tr>
          ))}
        </DeckTable>

        <div className="space-y-3">
          <Marker>Today — four tokens</Marker>
          <div className="flex flex-wrap gap-4">
            {CURRENT_SWATCHES.map((swatch) => (
              <Swatch key={swatch.label} {...swatch} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>The brand — four pairs</Marker>
          <div className="flex flex-wrap gap-4">
            {BRAND_SWATCHES.map((swatch) => (
              <Swatch key={swatch.label} {...swatch} />
            ))}
          </div>
        </div>

        <NoRuling>
          Context for the three slides that follow. The hues themselves are
          already ruled on — they are the brand&rsquo;s, exactly.
        </NoRuling>
      </Slide>

      {/* ---------------------------------------------------------- 3 */}
      <Slide id="strong-soft">
        <Prose>
          Each element arrives as a pair rather than one colour, and the draft
          spends them the same way on all four: soft carries text and glyphs,
          strong carries fills, borders, rings and glows. Uniformly, which is
          the point — the four elements stay one family instead of reading as
          three plus an exception.
        </Prose>
        <Prose>
          The number that settles it is wit. Wit-strong measures 3.81:1 against
          the card ground: fine for a 24 px glyph, which needs 3:1, and short of
          the 4.5:1 that body-size text needs. The slot in question carries body
          text — the home section sets each element&rsquo;s one-line description
          in it — so soft is what carries text, and every soft clears between
          7.15 and 8.21 on the card. The tightest pairing in the whole draft is
          a zone&rsquo;s own soft label over its own 10% strong tint, and the
          worst of those is 6.32:1.
        </Prose>
        <Prose>
          Measured, not eyeballed: <code>node scripts/yty-contrast.mjs</code>{" "}
          reads the hexes out of globals.css and prints every pairing against
          both grounds. The card ground is the lighter one, so the numbers below
          are its column — the page ground is looser everywhere.
        </Prose>

        <DeckTable
          head={[
            "Element",
            "Strong",
            "Strong on card",
            "Soft",
            "Soft on card",
            "Zone label on its own tint",
          ]}
        >
          {CONTRAST_ROWS.map((row) => (
            <tr key={row.element}>
              <Cell>{row.element}</Cell>
              <Cell muted>{row.strongHex}</Cell>
              <Cell>{row.strong}</Cell>
              <Cell muted>{row.softHex}</Cell>
              <Cell>{row.soft}</Cell>
              <Cell>{row.zone}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          4.5:1 is the body-text bar and 3:1 the glyph bar. Wit-strong at 3.81
          is the only cell in the table under 4.5, and it is the one number the
          whole presentation is shaped around.
        </Prose>

        <Ruling>
          <p>
            Accept the split principle: soft on text and glyphs, strong on
            fills, borders, rings and glows, on all four elements.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 4 */}
      <Slide id="home-yty">
        <Prose>
          The home page is where the cover&rsquo;s question gets answered,
          because it is a marketing surface and the Guidebook lets a marketing
          surface have the whole palette. Three frames, one page, same copy and
          same layout in all three — only how much colour it spends changes.
        </Prose>
        <Prose>
          The draft no longer stops at the Yty section. The four feature cards
          each take one element family in display order — pink, green, orange,
          blue — with the soft variant on the glyph and the strong one on the
          tile wash and its edge. The three how-it-works circles become harmony,
          glow and wit fills carrying ink. And the hero gains colour in its
          glow. Valor is deliberately absent from the circles: an orange one
          beside the amber CTA is the same collision slide 2 opened with.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">Accented</strong>{" "}
          keeps today&rsquo;s hero wash and adds one pink hint; the section
          grounds, the headline and the page&rsquo;s rhythm do not move.{" "}
          <strong className="font-semibold text-foreground">Lively</strong>{" "}
          draws the brand&rsquo;s own social look: a dusk sky of pink and blue
          with <em>no ambient amber at all</em>, so the only amber on screen is
          the CTA button; the headline goes white with a glow-green marker
          stroke behind its payoff words; the feature washes double; the
          how-it-works band is tinted rather than grey; and a palette rule sits
          under each section heading.
        </Prose>
        <Prose>
          Both are contrast-measured, not eyeballed. The binding number on the
          lively hero is where its two glows overlap into dusk purple — the
          subtitle over that composite reads 4.78:1, which is why the glows are
          22% and 18% and why a third one was cut. Every circle numeral clears
          the body-text bar on its fill: 6.11, 6.63 and 8.10.
        </Prose>

        <FrameRow>
          <DesktopFrame
            label="Today"
            src="/preview/home/current"
            height={980}
            scale={0.3}
          />
          <DesktopFrame
            label="Accented"
            src="/preview/home/brand-palette"
            height={980}
            scale={0.3}
          />
          <DesktopFrame
            label="Lively"
            src="/preview/home/brand-lively"
            height={980}
            scale={0.3}
          />
        </FrameRow>

        <Prose>
          The frames open at the top so the hero is the first thing compared.
          The Yty section is the same in both drafts — the dose question is
          about the page around it — so open a draft full size and scroll to it
          to judge the element cards.
        </Prose>

        <Ruling>
          <p>
            Sign off the home draft — the Yty section plus the new feature,
            how-it-works and hero colour — or name what to tune.
          </p>
          <p>
            Pick the dose: accented, lively, or a point between the two named as
            a change.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 5 */}
      <Slide id="gamer-floor">
        <Prose>
          The gamer dashboard is a mobile-first surface, so it is judged at the
          360 px floor — the Android baseline, and the archetypal family phone
          in our markets. Both frames below are real 360 px viewports, so the
          wrapping is the real wrapping.
        </Prose>
        <Prose>
          The draft carries two changes at once, because they cannot compete for
          your attention: the Yty grid in the brand hues, and the greeting
          swapped from Press Start 2P to Space Mono. The greeting has its own
          slide next; this slide is about the grid.
        </Prose>

        <FrameRow>
          <MobileFrame label="Today" src="/preview/gamer-dashboard/typical" />
          <MobileFrame
            label="Draft"
            src="/preview/gamer-dashboard/brand-palette"
          />
        </FrameRow>

        <Ruling>
          <p>Sign off the Yty grid at the floor, or name what to tune.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 6 */}
      <Slide id="greeting-face">
        <Prose>
          Press Start 2P lives under your own ruling that it is for rare,
          specialized uses. The gamer greeting is the site that fails that test
          hardest: the same child reads this exact line on every single visit,
          which is what a house face is, not what a special effect is. Space
          Mono is loaded, sanctioned by the Guidebook, placed nowhere yet — and
          the Guidebook names in-platform UI as its first use. This platform is
          that.
        </Prose>
        <Prose>
          The two faces are not interchangeable at one size. Press Start 2P
          advances a full em per character and Space Mono about 0.6, so the
          draft raises the number rather than keeping it: today is text-xl
          rising to text-3xl on wide screens, the draft is text-2xl rising to
          text-4xl. At 360 px the draft sets one line in Finnish and French
          where today&rsquo;s pixel face wraps. If you want more hero out of it,
          text-5xl on wide screens is roughly today&rsquo;s line footprint.
        </Prose>

        <FrameRow>
          <DesktopFrame
            label="The three candidates at the 360 floor, in the style guide"
            src="/admin/ui-components#type-faces-the-gamer-greeting-at-the-360px-floor"
            height={560}
            scale={0.68}
          />
        </FrameRow>

        <Ruling>
          <p>Approve the swap from Press Start 2P to Space Mono.</p>
          <p>
            Pick the wide-screen size: text-4xl as drafted, or text-5xl to keep
            today&rsquo;s footprint.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 7 */}
      <Slide id="wit">
        <Prose>
          One element shows a seam, and it is worth your eye before you sign the
          split off. Wit&rsquo;s two variants sit further apart in hue than the
          other three pairs do — a royal blue against a sky blue — so a wit card
          is a light-blue glyph on a royal wash, where the other three read as
          one hue at two strengths.
        </Prose>
        <Prose>
          It is the numbers&rsquo; answer, not a preference: wit-strong cannot
          carry body text on this ground, so the alternative is to make wit the
          one element that breaks the rule the other three follow.
        </Prose>

        <div className="flex flex-wrap gap-4">
          {YTY_ELEMENTS.map((element) => (
            <DraftElementCard key={element.id} element={element} />
          ))}
        </div>

        <Prose>
          Two ways out. Accept it as drafted — the seam is only visible when the
          four are compared side by side, which is a thing this deck does and a
          page never does. Or ask for a tuned dark variant of wit, which changes
          a brand colour and therefore escalates to the Guidebook&rsquo;s
          author; that runs in parallel and blocks none of the rest of the pass.
        </Prose>

        <Ruling>
          <p>Accept the wit pair as drafted, or escalate a tuned dark wit.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 8 */}
      <Slide id="buttons">
        <Prose>
          The Guidebook&rsquo;s button set mapped onto our dark ground. Its
          Primary is already ours to the digit — amber fill, ink label, no
          border — so it is shown once and there is nothing to decide about it.
          Its Secondary is specced as a dark border on white and is invisible
          here; its Ghost is the Guidebook&rsquo;s own on-dark button and is
          what the proposal adopts: transparent, 2 px foreground-colour border.
          Hover washes the border&rsquo;s own colour inward at a tenth alpha,
          because that shape has no fill to darken and anything else would
          introduce a second hue.
        </Prose>

        <FrameRow>
          <DesktopFrame
            label="Today beside proposed, every state adjacent"
            src="/admin/ui-components#button-guidebook-proposal-today-beside-proposed"
            height={1180}
            scale={0.68}
          />
        </FrameRow>

        <Prose>
          The blast radius, recounted from scratch — every real button plus
          every link wearing the button&rsquo;s clothes, across app code, with
          the style guide excluded. The plan estimated the violet fill at around
          thirteen sites; that count was picking up badges, which are a
          different component. The true number changes the decision:
        </Prose>

        <DeckTable head={["Variant", "Call sites", "Made of"]}>
          {BUTTON_COUNTS.map((row) => (
            <tr key={row.variant}>
              <Cell>{row.variant}</Cell>
              <Cell>{row.count}</Cell>
              <Cell muted>{row.note}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          So retiring the violet fill costs one line, not a sweep. The
          destructive and link variants are functional rather than brand
          variants and stay exactly as they are.
        </Prose>

        <Ruling>
          <p>
            The violet fill: does it retire into the new Secondary-on-dark, or
            survive under another name for the job it does today?
          </p>
          <p>
            The third tier, which the Guidebook does not specify: A, today&rsquo;s
            borderless ghost; B, a quiet 1 px border that reads as bounded but
            recessive; or C, label only, with no border and no fill ever.
          </p>
          <p>
            CTA type: today&rsquo;s 14 px at weight 500, or the
            Guidebook&rsquo;s 16 px at 600.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 9 */}
      <Slide id="faces">
        <Prose>
          Three faces are loaded: Poppins does body and every heading, Space
          Mono is sanctioned and placed nowhere, Press Start 2P is the rare-use
          display face. The specimens put one string through all three at three
          sizes, which is the comparison that has until now only been possible
          from memory.
        </Prose>

        <FrameRow>
          <DesktopFrame
            label="Specimens — one string, three faces, three sizes"
            src="/admin/ui-components#type-faces-specimens"
            height={660}
            scale={0.68}
          />
        </FrameRow>

        <Prose>
          And every Press Start 2P site in the product, with the draft decision
          for each. Six sites; the draft moves one.
        </Prose>

        <DeckTable head={["Site", "Draft decision", "Why"]}>
          {PS2P_SITES.map((row) => (
            <tr key={row.site}>
              <Cell>{row.site}</Cell>
              <Cell>{row.decision}</Cell>
              <Cell muted>{row.why}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          Net effect: five Press Start 2P sites and one Space Mono site. Two
          rows are worth a second look — the Roblox hero, because its face sits
          inside an approved partner placement, and the admin all-clear, whose
          face and trophy are one joke in two parts.
        </Prose>
        <Prose>
          One naming note, since it will show up in the wiring: Space Mono is
          reached as font-brand-mono rather than font-mono. Tailwind&rsquo;s
          font-mono is already spent on machine text — ids, tokens, code — and a
          brand display face answering to that name would get applied by anyone
          who just wanted a monospace.
        </Prose>

        <Ruling>
          <p>Ratify the table, or amend rows.</p>
        </Ruling>
      </Slide>

      {/* --------------------------------------------------------- 10 */}
      <Slide id="zones">
        <Prose>
          The Yty-named voice zones are the third surface the palette feeds, and
          the split applies unchanged: the element&rsquo;s soft variant on the
          glyph and the label, strong on the tile wash, the ring and the glow.
          The arithmetic here is already settled — a zone&rsquo;s label over its
          own tint is the tightest pairing in the draft and still clears at
          6.32:1 — so what is left is whether it looks right.
        </Prose>

        <FrameRow>
          <DesktopFrame
            label="Today beside the brand draft, both real zone lists"
            src="/admin/ui-components#voice-room-yty-zones-today-beside-the-brand-draft"
            height={760}
            scale={0.68}
          />
        </FrameRow>

        <Ruling>
          <p>Sign off the zone tiles, or name what to tune.</p>
        </Ruling>
      </Slide>

      {/* --------------------------------------------------------- 11 */}
      <Slide id="reach">
        <Prose>
          The Guidebook rations colour by surface, and its rule restated so this
          slide stands alone: parent, partner, billing and safety surfaces get
          amber as the single accent on a calm ground; family story surfaces get
          amber plus one palette family; gamer, community and in-world surfaces
          welcome the full palette.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            Direction given: broad.
          </strong>{" "}
          This slide used to ask an open question about how far the palette
          reaches. You have since answered it — the site should be brighter and
          more fun, the way the marketing is — so the drafts stopped fencing the
          palette inside the Yty section. Slide 4 is what that decision looks
          like on a real page, at two doses.
        </Prose>
        <Prose>
          That leaves one part of the rationing rule unanswered, and it is the
          part the Guidebook is most specific about: the calm ring. Billing,
          safeguarding and legal surfaces are specced as amber-single-accent on
          a quiet ground, and there is a real argument for keeping them that way
          that has nothing to do with taste — a page about a charge or a
          child&rsquo;s safety reads as more serious when it is not decorated.
          Whatever you pick becomes a written rule in the Styling section of the
          root CLAUDE.md at wiring time, so a future surface does not re-decide
          it.
        </Prose>

        <Ruling>
          <p>
            The calm ring — billing, safeguarding, legal. Confirm the
            Guidebook&rsquo;s amber-only treatment there, or adjust it.
          </p>
          <p>
            A — confirm: those surfaces stay amber as the single accent, and the
            palette stops at their door.
          </p>
          <p>
            B — adjust: name what the palette is allowed to do there, such as
            status and category marks but not decoration.
          </p>
        </Ruling>
      </Slide>

      {/* --------------------------------------------------------- 12 */}
      <Slide id="status-colours">
        <Prose>
          The app has four functional status colours — info, success, warning,
          destructive — and they predate the brand palette by a long way. Two of
          them now land inside a brand family, which is the same defect slide 2
          opened with: the old glow amber colliding with the CTA amber. One hue,
          two meanings, and nothing on screen to tell a reader which one it is.
        </Prose>
        <Prose>
          <code>--info</code> resolves to #308CE8. Wit strong is #3A71DE and wit
          soft is #4DB3F5 — info sits between them, at 210° between their 220°
          and 204°. <code>--success</code> resolves to #2EB88A against glow
          strong #1AB061, twelve degrees apart. The other two are safely clear:
          warning and destructive are 43.9 and 42.6 away from their nearest
          brand family, which is a different colour by any measure.
        </Prose>

        {STATUS_SWATCH_ROWS.map((row) => (
          <div key={row.heading} className="space-y-3">
            <Marker>{row.heading}</Marker>
            <div className="flex flex-wrap gap-4">
              {row.swatches.map((swatch) => (
                <Swatch key={swatch.label} {...swatch} />
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-3">
          <Marker>The same collision, as the app draws it</Marker>
          <div className="space-y-3">
            {STATUS_CHIPS.map((pair) => (
              <div key={pair.caption} className="flex flex-wrap items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {pair.caption}
                </span>
                <StatusChip {...pair.status} />
                <StatusChip {...pair.brand} />
              </div>
            ))}
          </div>
          <Prose>
            Left of each pair is a status chip the app ships today; right of it
            is the brand family the draft would put on the same screen. Nothing
            distinguishes &ldquo;this is information&rdquo; from &ldquo;this is
            the Wit element&rdquo; except the words inside them.
          </Prose>
        </div>

        <DeckTable
          head={["Token", "Resolves to", "Against", "Brand hex", "Hue", "Distance"]}
        >
          {STATUS_COLLISIONS.map((row) => (
            <tr key={`${row.token}-${row.against}`}>
              <Cell>
                <code>{row.token}</code>
              </Cell>
              <Cell muted>{row.hex}</Cell>
              <Cell>{row.against}</Cell>
              <Cell muted>{row.againstHex}</Cell>
              <Cell muted>{row.hue}</Cell>
              <Cell>{row.distance}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          Distance is CIE76 in Lab — a rough but honest &ldquo;would a person
          call these two colours or two shades&rdquo;. Under about 25 is the
          range where they read as one thing.
        </Prose>

        <Prose>
          The recommendation is to converge at wiring time: point{" "}
          <code>--info</code> at the wit family and <code>--success</code> at
          the glow family, so the app has one blue and one green and a reader
          never has to work out which system a colour belongs to. It costs
          nothing at the call sites — both are tokens, and every consumer
          inherits — and it means the palette is genuinely one palette rather
          than a brand set plus a legacy set that happen to overlap. Warning and
          destructive are untouched either way.
        </Prose>

        <Ruling>
          <p>
            A — converge: <code>--info</code> takes the wit family,{" "}
            <code>--success</code> takes the glow family.
          </p>
          <p>
            B — keep both, accepting that the app carries two blues and two
            greens that mean different things.
          </p>
          <p>
            C — defer it to the categorical-labelling follow-up, which is
            already the place a meaning-free multi-state palette gets designed.
          </p>
        </Ruling>
      </Slide>

      {/* --------------------------------------------------------- 13 */}
      <Slide id="recap">
        <Prose>
          Fourteen rulings, in the order they were asked. Any of them can come
          back as tune this rather than yes. The cover&rsquo;s question is the
          one they add up to: whether this app can be as bright and lively as
          the marketing site on a dark ground, inside the Guidebook.
        </Prose>

        <ol className="max-w-prose list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>
            Slide 3 — accept the strong and soft split: soft on text and glyphs,
            strong on fills, borders, rings and glows.
          </li>
          <li>
            Slide 4 — the home draft: the Yty section plus the feature cards,
            the how-it-works circles and the hero.
          </li>
          <li>Slide 4 — the dose: accented, or lively.</li>
          <li>Slide 5 — the gamer dashboard Yty grid at the 360 floor.</li>
          <li>Slide 6 — the greeting swaps from Press Start 2P to Space Mono.</li>
          <li>
            Slide 6 — the greeting&rsquo;s wide-screen size: text-4xl as
            drafted, or text-5xl.
          </li>
          <li>
            Slide 7 — wit&rsquo;s strong and soft pair: accept the seam, or
            escalate a tuned dark wit to the Guidebook&rsquo;s author.
          </li>
          <li>
            Slide 8 — the violet fill: retire into Secondary-on-dark, or survive
            under another name.
          </li>
          <li>
            Slide 8 — the third button tier: A ghost as today, B a quiet 1 px
            border, or C label only.
          </li>
          <li>
            Slide 8 — CTA type: today&rsquo;s 14 px at 500, or 16 px at 600.
          </li>
          <li>
            Slide 9 — ratify the Press Start 2P table, or amend rows.
          </li>
          <li>Slide 10 — the voice-zone Yty tiles.</li>
          <li>
            Slide 11 — the calm ring: confirm the Guidebook&rsquo;s amber-only
            treatment of billing, safeguarding and legal, or adjust it.
          </li>
          <li>
            Slide 12 — the status colours: converge info onto wit and success
            onto glow, keep both sets, or defer to the categorical-labelling
            follow-up.
          </li>
        </ol>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>What happens on sign-off</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              The wiring phase lands the tokens app-wide, including the hex
              palette the emails and canvas draw from, so nothing is left
              documenting the old colours. The button variants swap with their
              call sites fixed. The face decisions are applied to the live
              surfaces. The palette rules you settle here are written into the
              root CLAUDE.md and the deviations log. If slide 12 says converge,
              the two status tokens move in the same commit as the Yty ones —
              they are tokens, so it is a value change and no call site is
              touched.
            </p>
            <p>
              Then the scaffolding goes: the draft scenarios, the draft colour
              map, and this page.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Feedback
          </div>
          <p className="max-w-prose text-sm text-foreground">
            Reply in the Claude session, referencing slide numbers. A slide can
            be answered with a change rather than a yes; the drafts are cheap to
            move while they are still fixtures.
          </p>
        </div>
      </Slide>
    </div>
  );
}

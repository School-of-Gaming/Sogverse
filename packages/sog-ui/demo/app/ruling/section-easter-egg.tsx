/**
 * Question 2 — the Klingon easter egg.
 *
 * **What the egg is.** `about/about-section.tsx` renders one extra card at the
 * foot of the About page, and only when the locale is `tlh`: a Klingon console
 * carrying the glossary of the joke — sixteen of the app's own strings beside
 * their tlhIngan Hol translations and a literal gloss of each, a note saying the
 * three legal names have been retired from the joke, a note about Intl having no
 * Klingon locale data, and a Qapla'. It is drawn as an Empire console: a
 * near-black card, a red rule bleeding in from both edges, red headings and red
 * values.
 *
 * **Why its two hexes are exempt.** `#d00` and `#0a0a0a` are the Klingon
 * Empire's colours, not School of Gaming's. The card is a *picture* of a
 * console, on the same terms as the locale picker's flags and the admin
 * dashboard's trophy sprite: a thing that carries its own palette because it is
 * artwork rather than a piece of UI. A brand token has no business there, and
 * the day the brand's amber changed, this card should not follow. The three
 * `rgba(221,0,0,…)` edges are the same red at the strengths the drawing needs
 * and ride the same exemption — an artwork's own paint, mixed inside the
 * artwork.
 *
 * **Why the eight faded whites are not artwork.** They are not part of the
 * picture; they are the words *inside* it — an intro sentence, three column
 * headers, two table columns and two footnotes. Ordinary secondary text, drawn
 * from a colour the palette does not name, at four strengths nobody chose. Two
 * landed rules reach them independently and agree:
 *
 * - **The no-alpha rule.** `text-white/40` is a grey the library never authored
 *   and has measured no pairing for. Over this card's `#0A0A0A` ground the eight
 *   composite to five different greys, and the two deepest fail outright: /70
 *   measures 9.76, /60 7.30, /50 5.37, /40 3.77 and /30 2.61 — the last two
 *   under the 4.5 body floor, and the last under the 3 glyph floor as well. The
 *   palette's quiet ink measures 8.13 on the same ground and its ink 16.91, so
 *   both replacements are better than four of the five steps they retire.
 * - **The label rule (§11).** Coloured ink exists only on a short label beside a
 *   mark in the same hue; everything a reader reads through is ink or white, and
 *   in this theme that means `foreground` or `muted-foreground`. Every one of
 *   the eight is read through.
 *
 * **The per-step decision, and why it is not one token for all eight.** The four
 * strengths were doing one job worth keeping: ranking the table's three columns.
 * The English label is what a reader scans; the literal meaning is the aside
 * beside it. Collapsing both to the quiet ink would flatten that ranking, so the
 * one step at 70% takes `foreground` and the other seven take
 * `muted-foreground`, which is the same two-tier reading the alpha steps were
 * approximating with five values. The intro's own step is the most redundant of
 * the eight: `CardDescription` already paints `text-muted-foreground`, so the
 * `text-white/60` is a hand-rolled restatement of the token it overrides, and
 * removing it lands on exactly what the component would have drawn.
 *
 * | site | sites | today | proposed |
 * |---|---|---|---|
 * | the English column | 1 | `text-white/70` | `text-foreground` |
 * | the intro | 1 | `text-white/60` | `text-muted-foreground` |
 * | the three column headers | 3 | `text-white/50` | `text-muted-foreground` |
 * | the literal-meaning column | 1 | `text-white/40` | `text-muted-foreground` |
 * | the retired note | 1 | `text-white/40` | `text-muted-foreground` |
 * | the closing note | 1 | `text-white/30` | `text-muted-foreground` |
 *
 * **What lands.** The file keeps its hex exemption, for the artwork and only for
 * the artwork: `eslint.config.mjs`'s block for `about-section.tsx` narrows from
 * `"no-restricted-syntax": "off"` to the shape the other artwork files carry —
 * the hex ban off, the palette-class ban back on — which is what makes the
 * `text-white` exemption go rather than a promise not to write one. The two
 * ledger rows go with the page: the loose-colour row for the easter egg's white,
 * and the alpha row that collects its eight steps. After it, the only `/n` left
 * anywhere in `src` is the pair of Button hover shades the Button adoption owns.
 *
 * **The block is copied class for class at its real size**, `max-w-3xl` and all,
 * with one mechanical change: `Card`, `CardHeader`, `CardTitle`,
 * `CardDescription` and `CardContent` are inlined as the classes they resolve
 * to, because the demo may not import from `src/`. Where a call site overrode a
 * base class — the description's `text-base` over `text-sm`, its white over
 * `text-muted-foreground` — the merged result is written, which is what
 * `cn()` produces at runtime.
 *
 * The two columns are one component drawn twice with two sets of inks, so
 * nothing but the inks can differ between them.
 */

import { Caps, Case, Compare, Exemplar, Question } from "./parts";

/** The sixteen glossary rows, verbatim from the `tlh` messages the block renders. */
const ROWS: readonly (readonly [string, string, string])[] = [
  [
    "School of Gaming",
    "noH Quj yejHaD",
    "War Game Academy — because to a Klingon, all games are battle training",
  ],
  [
    "Where screen time becomes quality time",
    "naDev Quj yay’ moj",
    "Here, games become victory",
  ],
  ["Delete", "yIHoH", "Kill it!"],
  ["Deleting...", "vIHoH...", "I’m killing..."],
  ["Close", "yISoQmoH", "Make it shut up!"],
  ["Cancel", "yImev", "Stop!"],
  ["Get Started", "DaH yIqet", "Run now!"],
  ["Forgot password?", "mu’mey DaSovbe’?", "You don’t know the words?"],
  ["Unexpected error", "Qagh Daj ’oH", "It is an interesting error"],
  ["English (language name)", "tera’ngan Hol", "Earther language"],
  ["OK", "Qapla’", "Success!"],
  ["All rights reserved", "Hoch batlh", "All honour"],
  ["Learn More", "bIghojnIS", "You need to learn"],
  [
    "Privacy Policy",
    "Privacy Policy (So’wI’)",
    "So’wI’ is a cloaking device — what a Klingon calls keeping something out of sight",
  ],
  [
    "Terms & Conditions",
    "Terms of the Pact",
    "The pact is the agreement itself, sworn to before the first battle",
  ],
  [
    "Anti-Bullying",
    "Code of Honor",
    "A warrior who preys on the weak has no honour to speak of",
  ],
];

const HEADING = "You found the Klingon translation!";
const INTRO =
  "This interface has been translated into tlhIngan Hol as a tribute to Star Trek and its fans. Here are some of our favourite translations:";
const RETIRED_NOTE =
  "Those last three names are retired. The Privacy Policy, the Terms & Conditions and the Anti-Bullying Policy now read the same in every locale, Federation Standard included — they are binding documents, and no family should have to decode their own rights. An honourable translation, but the wrong battlefield for one.";
const NOTE =
  "Date and time formatting appears in English because the browser’s Intl APIs don’t have Klingon locale data. Klingons don’t use a 7-day week anyway.";
const QAPLA = "Qapla’!";

const HEADERS = ["English", "tlhIngan Hol", "Literal meaning"] as const;

/** The artwork's own paint: the Empire's red and its console ground, and the edges mixed from the red. */
const RED = "#d00";
const GROUND = "#0a0a0a";
const EDGE_STRONG = "rgba(221,0,0,0.4)";
const EDGE_HEAD = "rgba(221,0,0,0.3)";
const EDGE_ROW = "rgba(221,0,0,0.1)";

/** The six inks the block sets, which is the whole of what this question moves. */
interface Inks {
  readonly intro: string;
  readonly header: string;
  readonly label: string;
  readonly meaning: string;
  readonly retiredNote: string;
  readonly note: string;
}

const TODAY: Inks = {
  intro: "text-white/60",
  header: "text-white/50",
  label: "text-white/70",
  meaning: "text-white/40",
  retiredNote: "text-white/40",
  note: "text-white/30",
};

const PROPOSED: Inks = {
  intro: "text-muted-foreground",
  header: "text-muted-foreground",
  label: "text-foreground",
  meaning: "text-muted-foreground",
  retiredNote: "text-muted-foreground",
  note: "text-muted-foreground",
};

function Egg({ inks }: { inks: Inks }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div
        className="overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-sm"
        style={{ borderColor: EDGE_STRONG, backgroundColor: GROUND }}
      >
        <div
          style={{
            height: 2,
            background: `linear-gradient(90deg, transparent, ${RED}, transparent)`,
          }}
        />
        <div className="flex flex-col space-y-1.5 p-6 text-center">
          <h3
            className="text-2xl leading-none font-semibold tracking-tight"
            style={{ color: RED }}
          >
            {HEADING}
          </h3>
          <p className={`text-base ${inks.intro}`}>{INTRO}</p>
        </div>
        <div className="p-6 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b border-border text-left"
                  style={{ borderColor: EDGE_HEAD }}
                >
                  {HEADERS.map((header) => (
                    <th
                      key={header}
                      className={`pb-2 pr-4 font-medium ${inks.header}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, value, meaning]) => (
                  <tr
                    key={label}
                    className="border-b border-border"
                    style={{ borderColor: EDGE_ROW }}
                  >
                    <td className={`py-2 pr-4 ${inks.label}`}>{label}</td>
                    <td
                      className="py-2 pr-4 font-mono"
                      style={{ color: RED }}
                    >
                      {value}
                    </td>
                    <td className={`py-2 italic ${inks.meaning}`}>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`mt-6 text-xs leading-5 ${inks.retiredNote}`}>
            {RETIRED_NOTE}
          </p>
          <p className={`mt-4 text-center text-xs ${inks.note}`}>{NOTE}</p>
          <p
            className="mt-4 text-center text-2xl font-bold"
            style={{ color: RED }}
          >
            {QAPLA}
          </p>
        </div>
      </div>
    </div>
  );
}

/** One row of the key: which ink moves, how many sites carry it, and where it goes. */
const STEPS: readonly (readonly [string, string, string, string])[] = [
  ["The English column", "1", "text-white/70", "text-foreground"],
  ["The intro", "1", "text-white/60", "text-muted-foreground"],
  ["The three column headers", "3", "text-white/50", "text-muted-foreground"],
  ["The literal-meaning column", "1", "text-white/40", "text-muted-foreground"],
  ["The retired note", "1", "text-white/40", "text-muted-foreground"],
  ["The closing note", "1", "text-white/30", "text-muted-foreground"],
  ["The card ground", "1", "#0A0A0A", "#0A0A0A, artwork"],
  ["The rule, the headings, the values", "6", "#DD0000", "#DD0000, artwork"],
  ["The card and row edges", "3", "rgba(221,0,0,…)", "unchanged, artwork"],
];

function Key() {
  return (
    <div className="mt-12">
      <Caps>Every colour the block sets</Caps>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-s">
          <thead>
            <tr className="border-b border-border text-left align-bottom">
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Site
              </th>
              <th className="py-2 pr-4 text-right font-semibold tracking-wider uppercase">
                Uses
              </th>
              <th className="py-2 pr-4 font-semibold tracking-wider uppercase">
                Today
              </th>
              <th className="py-2 font-semibold tracking-wider uppercase">
                Proposed
              </th>
            </tr>
          </thead>
          <tbody>
            {STEPS.map(([site, uses, today, proposed]) => (
              <tr key={site} className="border-b border-border align-top">
                <td className="py-2 pr-4">{site}</td>
                <td className="py-2 pr-4 text-right font-brand-mono text-muted-foreground">
                  {uses}
                </td>
                <td className="py-2 pr-4 font-brand-mono text-muted-foreground">
                  {today}
                </td>
                <td className="py-2 font-brand-mono">{proposed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EasterEggSection() {
  return (
    <Question n={2} title="The Klingon easter egg">
      <Case title="The console, and the words inside it">
        <Compare>
          <div>
            <Caps>Today</Caps>
            <div className="mt-3">
              <Exemplar
                file="about/about-section.tsx"
                page="the About page, locale tlh"
              >
                <Egg inks={TODAY} />
              </Exemplar>
            </div>
          </div>
          <div>
            <Caps>Proposed</Caps>
            <div className="mt-3">
              <Exemplar
                file="about/about-section.tsx"
                page="the About page, locale tlh"
              >
                <Egg inks={PROPOSED} />
              </Exemplar>
            </div>
          </div>
        </Compare>
        <Key />
      </Case>
    </Question>
  );
}

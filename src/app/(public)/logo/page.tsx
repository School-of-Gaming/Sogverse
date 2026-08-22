/* eslint-disable i18next/no-literal-string -- design-review surface for judging the mark, not product copy: the same posture as the admin style guide. Public only so the link reaches people without accounts; nothing here is ever shown to a family, and the whole route is deleted when the favicon decision lands. */
import type { Metadata } from "next";
import {
  CHEVRON,
  CONTRAST,
  MARKS,
  MARK_LADDER,
  RULED_OUT,
  RULES,
  ROUTE_1,
  ROUTE_2,
  STRIP_ITEMS,
  type Candidate,
  type Group,
} from "./manifest";
import { CHROME, type ChromeTheme } from "./browser-chrome";
import { DECOYS } from "./decoys";

export const metadata: Metadata = {
  title: "Logo explorations",
  // Same posture as /roblox: shared by URL so it can be put in front of people,
  // but deliberately undiscoverable. Not disallowed in robots.txt on purpose —
  // a disallowed URL is never crawled, so this tag would never be read and the
  // bare URL could still be indexed off an external link.
  robots: { index: false, follow: false },
};

// Developer- and design-facing copy, in literal English rather than the message
// files, on the same reasoning as the preview scenes: this is a working surface
// for judging a design, never product copy shown to a family. It is public only
// so a link can be sent to people without accounts, and it leaves with the
// decision it exists to settle.

/** Deterministic, so a reload does not reshuffle the neighbours mid-decision. */
function makeDealer(seed: number) {
  let s = seed;
  const rnd = (n: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % n;
  };
  let bag: number[] = [];
  // Draw without replacement: a real browser does not have one tab open four
  // times, and repeats make the strip read as wallpaper rather than as tabs.
  return () => {
    if (bag.length === 0) bag = DECOYS.map((_, i) => i);
    return DECOYS[bag.splice(rnd(bag.length), 1)[0]];
  };
}

function Favicon({ file, size }: { file: string; size: number }) {
  return (
    // Plain <img>: these are first-party SVGs that need no optimisation pass,
    // and both dimensions are set so nothing reflows once the file lands.
    // eslint-disable-next-line @next/next/no-img-element -- SVG, fixed size, no optimisation wanted
    <img src={`/logo/${file}`} alt="" width={size} height={size} style={{ width: size, height: size }} />
  );
}

function Tab({ title, theme, children }: { title: string; theme: ChromeTheme; children: React.ReactNode }) {
  return (
    <div
      className="flex h-[34px] min-w-0 items-center gap-2 overflow-hidden rounded-t-lg px-3"
      style={{ background: CHROME[theme].tab, color: CHROME[theme].text }}
    >
      <div className="size-4 shrink-0">{children}</div>
      <span className="truncate text-xs">{title}</span>
    </div>
  );
}

function DecoyTab({ index, theme }: { index: number; theme: ChromeTheme }) {
  const d = DECOYS[index];
  return (
    <Tab title={d.title} theme={theme}>
      <svg viewBox="0 0 16 16" className="block size-4" aria-hidden>
        {d.icon}
      </svg>
    </Tab>
  );
}

/** One row per candidate, fresh neighbours each time, SOG tab in a moving slot. */
function FindYours({ theme }: { theme: ChromeTheme }) {
  return (
    <div className="space-y-2">
      {STRIP_ITEMS.map((item, row) => {
        const next = makeDealer(101 + row * 37);
        const at = 2 + (row % 5);
        const slots = Array.from({ length: 8 }, (_, i) => {
          if (i === at) return null;
          return DECOYS.indexOf(next());
        });
        return (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-9 shrink-0 text-right font-mono text-[11px] text-primary">{item.id}</div>
            <div
              className="flex flex-1 gap-0.5 overflow-hidden rounded-lg p-2"
              style={{ background: CHROME[theme].strip }}
            >
              {slots.map((decoyIndex, i) => (
                <div key={i} className="min-w-0 flex-1">
                  {decoyIndex === null ? (
                    <Tab title="School of Gaming" theme={theme}>
                      <Favicon file={item.file} size={16} />
                    </Tab>
                  ) : (
                    <DecoyTab index={decoyIndex} theme={theme} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Everything in one strip, for direct side-by-side comparison. */
function FullStrip({ theme }: { theme: ChromeTheme }) {
  const next = makeDealer(7);
  const cells: React.ReactNode[] = [];
  STRIP_ITEMS.forEach((item, i) => {
    cells.push(<DecoyTab key={`d${i}a`} index={DECOYS.indexOf(next())} theme={theme} />);
    if (i % 3 === 1) cells.push(<DecoyTab key={`d${i}b`} index={DECOYS.indexOf(next())} theme={theme} />);
    cells.push(
      <div key={item.id} className="flex flex-col">
        <Tab title="School of Gaming" theme={theme}>
          <Favicon file={item.file} size={16} />
        </Tab>
        <div className="pt-1 text-center font-mono text-[11px] text-primary">{item.id}</div>
      </div>,
    );
  });
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg p-2.5" style={{ background: CHROME[theme].strip }}>
      {cells.map((cell, i) => (
        <div key={i} className="w-[158px]">
          {cell}
        </div>
      ))}
    </div>
  );
}

function IconCard({ item }: { item: Candidate }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs">
        <span className="mr-1.5 font-semibold text-primary">{item.id}</span>
        <code className="font-mono text-xs text-muted-foreground">{item.file.replace(".svg", "")}</code>
      </div>
      <p className="mb-3 mt-1 min-h-14 text-xs text-muted-foreground">{item.note}</p>
      <div className="mb-3 flex justify-center">
        <Favicon file={item.file} size={104} />
      </div>
      {/* Both strips: a dark-grounded mark can vanish on a dark tab and a
          light-grounded one can vanish on a light one, and only showing both
          catches it. */}
      {(["light", "dark"] as const).map((theme) => (
        <div
          key={theme}
          className="mb-1.5 flex items-center justify-center gap-3.5 rounded-md p-2"
          style={{ background: theme === "light" ? CHROME.light.strip : CHROME.dark.tab }}
        >
          {[16, 24, 32].map((s) => (
            <Favicon key={s} file={item.file} size={s} />
          ))}
        </div>
      ))}
    </div>
  );
}

function GroupBlock({ group }: { group: Group }) {
  return (
    <>
      <h3 className="mb-1 mt-7 text-sm font-semibold text-foreground">{group.title}</h3>
      {group.blurb ? <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">{group.blurb}</p> : null}
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
        {group.items.map((item) => (
          <IconCard key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

function SectionHeading({ children, badge }: { children: React.ReactNode; badge?: string }) {
  return (
    <h2 className="mb-1 mt-12 text-[15px] font-semibold uppercase tracking-wider text-primary">
      {children}
      {badge ? (
        <span className="ml-2 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 align-middle text-[11px] font-normal normal-case tracking-normal text-success">
          {badge}
        </span>
      ) : null}
    </h2>
  );
}

export default function LogoExplorationsPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 pb-20">
      <h1 className="text-xl font-semibold">School of Gaming — mark explorations</h1>
      <p className="mt-1 max-w-[84ch] text-sm text-muted-foreground">
        All geometry derived from the real logo, with both master-asset defects repaired: the
        letters-cut-as-holes seam, and a stray node in the S.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {RULES.map((r) => (
          <div key={r.n} className="flex-1 basis-[300px] rounded-r-lg border-l-[3px] border-primary bg-card p-3 px-4">
            <p className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-primary">{r.n}.</span> {r.text}
            </p>
          </div>
        ))}
      </div>

      <SectionHeading badge="decided">The mark</SectionHeading>
      <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">
        Two variants, both carrying the repaired geometry and the intrinsic dimensions that let the browser
        reserve their box before the file lands.
      </p>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(460px,1fr))]">
        {MARKS.map((m) => (
          <section key={m.file} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span className="text-sm font-bold uppercase tracking-wide text-primary">{m.kind}</span>{" "}
                <code className="font-mono text-xs">{m.file}</code>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">379×207.5</span>
            </div>
            <p className="mt-3 text-[13px]">
              <span className="font-semibold text-primary">Use:</span> {m.use}
            </p>
            <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{m.what}</p>
            <div className="mb-2 flex justify-center rounded-lg border border-border bg-background p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG, fixed height, no optimisation wanted */}
              <img src={`/logo/${m.file}`} alt="" width={379} height={207.5} style={{ height: 118, width: "auto" }} />
            </div>
            <div className="mb-2 flex justify-center rounded-lg bg-white p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG, fixed height, no optimisation wanted */}
              <img src={`/logo/${m.file}`} alt="" width={379} height={207.5} style={{ height: 118, width: "auto" }} />
            </div>
            <div className="flex flex-wrap items-end gap-5 rounded-lg border border-border bg-background px-4 pb-2.5 pt-3.5">
              {MARK_LADDER.map((h) => (
                <div key={h} className="flex flex-col items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- SVG, fixed height, no optimisation wanted */}
                  <img src={`/logo/${m.file}`} alt="" width={379} height={207.5} style={{ height: h, width: "auto" }} />
                  <span className="font-mono text-[10px] text-muted-foreground">{h}px</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <SectionHeading>Find yours — fresh neighbours each row</SectionHeading>
      <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">
        One row per candidate, each with a different set of real tabs around it and the SOG tab in a different
        position, so the scan runs again from scratch instead of being learned once. The candidate you land on
        without hunting is the answer. The neighbouring favicons are our own simplified approximations of other
        companies&apos; marks, drawn only so the test has realistic noise.
      </p>
      <h3 className="mb-2 mt-6 text-sm font-semibold">Light</h3>
      <FindYours theme="light" />
      <h3 className="mb-2 mt-6 text-sm font-semibold">Dark</h3>
      <FindYours theme="dark" />

      <SectionHeading>In one strip — true 16px</SectionHeading>
      <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">
        The same candidates together, for direct comparison rather than search: the true letterform (
        <span className="font-semibold">SC</span>) against the N8 chevron (<span className="font-semibold">D</span>
        ), in the same six containers.
      </p>
      <div className="space-y-4">
        <FullStrip theme="light" />
        <FullStrip theme="dark" />
      </div>

      <SectionHeading>Route 1 — the true letterform</SectionHeading>
      <p className="max-w-[84ch] text-sm text-muted-foreground">
        Black S on yellow, per rule 3. The S is 1.25:1, so it sizes to the width and leaves room above and
        below — the cost of using the real thing.
      </p>
      {ROUTE_1.map((g) => (
        <GroupBlock key={g.title} group={g} />
      ))}

      <SectionHeading>Route 2 — no letter at all</SectionHeading>
      <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">
        Down to one. N8 is the direction; the ladders below are its exploration.
      </p>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
        {ROUTE_2.map((item) => (
          <IconCard key={item.id} item={item} />
        ))}
      </div>

      <SectionHeading>Chevron — exploring N8</SectionHeading>
      <p className="max-w-[84ch] text-sm text-muted-foreground">
        Angle, terminals and count are settled at N8&apos;s values. Two questions left, and each row moves
        exactly one of them.
      </p>
      {CHEVRON.map((g) => (
        <GroupBlock key={g.title} group={g} />
      ))}

      <SectionHeading>Reference</SectionHeading>
      <p className="mb-3 max-w-[84ch] text-sm text-muted-foreground">
        Why rule 2 exists. Purple sits between our two extremes (luminance 0.11), so it cannot carry the mark
        against dark <em>or</em> against our dark letterform.
      </p>
      <table className="text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="border-b border-border py-1 pr-8 text-left font-semibold">pair</th>
            <th className="border-b border-border py-1 pr-8 text-left font-semibold">ratio</th>
            <th className="border-b border-border py-1 text-left font-semibold" />
          </tr>
        </thead>
        <tbody>
          {CONTRAST.map((row) => (
            <tr key={row.pair}>
              <td className="border-b border-border py-1 pr-8">{row.pair}</td>
              <td className="border-b border-border py-1 pr-8">{row.ratio}</td>
              <td className={`border-b border-border py-1 ${row.ok ? "text-success" : "text-destructive"}`}>
                {row.verdict}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionHeading>Ruled out</SectionHeading>
      <p className="mb-4 max-w-[84ch] text-sm text-muted-foreground">Kept so nobody re-proposes them.</p>
      <div className="grid gap-2.5 opacity-40 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {RULED_OUT.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
            <Favicon file={item.file} size={46} />
            <div className="min-w-0">
              <code className="font-mono text-xs text-muted-foreground">{item.file.replace(".svg", "")}</code>
              <p className="text-[11px] text-muted-foreground">{item.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

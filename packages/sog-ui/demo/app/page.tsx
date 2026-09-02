import {
  BRAND,
  COLOUR_RULES,
  LORE_LEVELS,
  NEUTRALS,
  RADIUS_GUIDANCE,
  RADIUS_SCALE,
  STATUS,
  TONE_TO_FAMILY,
  TONES,
  YTY_FAMILIES,
} from "../../src/tokens/brand";
import { measure, pairingsFor, passes } from "../../src/tokens/contrast";
import {
  FACES,
  NON_UI_FACES,
  TYPE_RULES,
  TYPE_SCALE,
} from "../../src/tokens/typography";
import {
  FACE_CLASS,
  FILL,
  RADIUS_CLASS,
  STEP_CLASS,
  STEP_MOBILE_CLASS,
  TEXT,
  WEIGHT_CLASS,
  WEIGHT_NAME,
} from "./token-classes";

/**
 * The foundations floor.
 *
 * Every value on this page is read from `src/tokens/`, and every contrast ratio
 * is measured at render. Nothing here is retyped from a table, which is the
 * point: a token that moves moves here too, and a pairing that stops clearing
 * its threshold says so on the page as well as in the test.
 */

const SPECIMEN = "Sogverse ABCÄÖ abcäö 0123";
const SIGNATURE = "Aino Virtanen";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-body-s font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20">
      <h2 className="text-h2">{title}</h2>
      {caption ? (
        <p className="mt-2 max-w-[70ch] text-body-l text-muted-foreground">
          {caption}
        </p>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function SourceTag({ source }: { source: string }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-body-s uppercase tracking-wide text-muted-foreground">
      {source}
    </span>
  );
}

/** Every pairing the library ships that touches this token, measured at render. */
function Contrast({ token }: { token: string }) {
  const pairings = pairingsFor(token);
  if (pairings.length === 0) {
    return (
      <p className="text-body-s text-muted-foreground">
        No shipped text pairing — this token is furniture, not a surface for text.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {pairings.map((pairing) => {
        const ratio = measure(pairing);
        const ok = passes(pairing);
        return (
          <li key={pairing.id} className="text-body-s">
            <span className="font-medium tabular-nums">
              {ratio.toFixed(2)}:1
            </span>
            <span className="text-muted-foreground">
              {" "}
              needs {pairing.threshold}:1 ·{" "}
            </span>
            <span className={ok ? "text-success" : "text-destructive"}>
              {ok ? "PASS" : "FAIL"}
            </span>
            <span className="text-muted-foreground"> · {pairing.why}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Swatch({
  token,
  name,
  hex,
  className,
}: {
  token: string;
  name: string;
  hex: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={`h-16 rounded-md border border-border ${FILL[token] ?? ""}`}
      />
      <p className="mt-2 text-h4 font-medium">{name}</p>
      <p className="font-brand-mono text-body-s text-muted-foreground">
        {hex} · --color-{token}
      </p>
    </div>
  );
}

function ColourCard({
  token,
  name,
  hex,
  source,
  role,
  extras,
}: {
  token: string;
  name: string;
  hex: string;
  source: string;
  role: string;
  extras?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Swatch token={token} name={name} hex={hex} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SourceTag source={source} />
      </div>
      <p className="mt-2 text-body-s">{role}</p>
      {extras}
      <div className="mt-3 border-t border-border pt-3">
        <Contrast token={token} />
      </div>
    </div>
  );
}

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="mt-2 text-body-s text-muted-foreground">
      <span className="font-semibold uppercase tracking-wide">{label}</span>{" "}
      {children}
    </p>
  );
}

export default function FoundationsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header>
        <Eyebrow>Foundations</Eyebrow>
        <h1 className="mt-2 text-h1">SOG-UI</h1>
        <p className="mt-4 max-w-[70ch] text-body-l text-muted-foreground">
          School of Gaming&rsquo;s UI language. Every colour, face and step below
          is read from the typed source in <code>src/tokens/</code>, and every
          contrast ratio is measured on this page rather than remembered.
        </p>
      </header>

      <Section
        title="Ground and ink"
        caption="One theme, and it is dark. The Guidebook draws its neutrals for a white page; each of ours does the same job read against the dark ground."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(NEUTRALS).map(([id, neutral]) => {
            const token = id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
            return (
              <ColourCard
                key={id}
                token={token}
                name={neutral.name}
                hex={neutral.hex}
                source={neutral.source}
                role={neutral.role}
                extras={
                  <>
                    {neutral.guidebook ? (
                      <Note label="Guidebook">
                        {neutral.guidebook.swatch} — {neutral.guidebook.role}
                      </Note>
                    ) : null}
                    {neutral.deviation ? (
                      <Note label="Deviation">{neutral.deviation}</Note>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="The signature pair"
        caption="Amber acts, violet is the world. They are mirror images: amber is light and takes only a dark label, violet is dark and takes only a light one."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(BRAND).map(([id, colour]) => (
            <ColourCard
              key={id}
              token={id}
              name={`${colour.name} · ${colour.tone}`}
              hex={colour.hex}
              source={colour.source}
              role={colour.role}
              extras={
                <>
                  <Note label="Usage">{colour.usage}</Note>
                  {colour.deviation ? (
                    <Note label="Deviation">{colour.deviation}</Note>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="The four families"
        caption="Strong fills, borders, rings and glows; soft carries text and glyphs. That split is a measurement, not a preference — read the ratios beside each variant."
      >
        <div className="space-y-6">
          {Object.entries(YTY_FAMILIES).map(([id, family]) => (
            <article
              key={id}
              className="rounded-lg border border-border bg-card p-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className={`text-h3 ${TEXT[`yty-${id}-soft`] ?? ""}`}>
                  {family.name}
                </h3>
                <span className="text-body-l text-muted-foreground">
                  {family.hue} · {family.tone}
                </span>
                <SourceTag source={family.source} />
              </div>
              <p className="mt-2 text-body-s">{family.relationship}</p>
              <p className="mt-1 text-body-s text-muted-foreground">
                {family.role}
              </p>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                {(["strong", "soft"] as const).map((variant) => (
                  <div key={variant}>
                    <Swatch
                      token={`yty-${id}-${variant}`}
                      name={`${family.name} ${variant}`}
                      hex={family[variant]}
                    />
                    <div className="mt-3 border-t border-border pt-3">
                      <Contrast token={`yty-${id}-${variant}`} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="The grammar"
        caption="A component takes the word, never the hue. These six are the whole vocabulary."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TONES.map((tone) => {
            const family = TONE_TO_FAMILY[tone];
            const token =
              family === "primary" || family === "secondary"
                ? family
                : `yty-${family}-soft`;
            return (
              <div
                key={tone}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <span
                  className={`size-6 shrink-0 rounded-sm ${FILL[token] ?? ""}`}
                />
                <span className="text-h4 font-medium">{tone}</span>
                <span className="text-body-s text-muted-foreground">
                  {family}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Status"
        caption="The Guidebook states no error, success or warning semantics, so the whole set is the design pass's — and the ratios below are why each foreground is what it is."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {Object.entries(STATUS).map(([id, status]) => (
            <ColourCard
              key={id}
              token={id}
              name={status.name}
              hex={status.hex}
              source={status.source}
              role={status.role}
              extras={
                status.deviation ? (
                  <Note label="Deviation">{status.deviation}</Note>
                ) : null
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="How colour is spent"
        caption="The palette is loud on purpose, and the same restraint that governs vocabulary governs colour."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-body-s">
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Level</th>
                <th className="py-2 pr-4 font-semibold">Audience</th>
                <th className="py-2 pr-4 font-semibold">Allowance</th>
                <th className="py-2 font-semibold">Rule</th>
              </tr>
            </thead>
            <tbody>
              {LORE_LEVELS.map((level) => (
                <tr key={level.id} className="border-b border-border align-top">
                  <td className="py-3 pr-4 font-medium">{level.id}</td>
                  <td className="py-3 pr-4">{level.audience}</td>
                  <td className="py-3 pr-4 text-primary">{level.allowance}</td>
                  <td className="py-3">
                    {level.rule}
                    {level.restraint ? (
                      <span className="block text-muted-foreground">
                        Our reading: {level.restraint}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-8 space-y-3">
          {COLOUR_RULES.map((entry) => (
            <li
              key={entry.rule}
              className="rounded-md border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <SourceTag source={entry.source} />
                <span className="text-body-l">{entry.rule}</span>
              </div>
              {entry.onDarkGround ? (
                <Note label="On dark">{entry.onDarkGround}</Note>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type faces"
        caption="The package owns the names; the consumer loads the files and defines the variable each name points at, on the root element."
      >
        <div className="space-y-6">
          {Object.entries(FACES).map(([id, face]) => (
            <article
              key={id}
              className="rounded-lg border border-border bg-card p-6"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="text-h3">{face.name}</h3>
                <span className="font-brand-mono text-body-s text-muted-foreground">
                  {face.token} → var({face.variable})
                </span>
                <SourceTag source={face.source} />
                {face.required ? <SourceTag source="required" /> : null}
              </div>
              <p className="mt-2 text-body-s">{face.role}</p>
              <p className="mt-1 text-body-s text-muted-foreground">
                {face.usage}
              </p>
              <p className="mt-1 font-brand-mono text-body-s text-muted-foreground">
                fallback: {face.fallback} · subsets: {face.subsets.join(", ")}
              </p>
              <div className="mt-5 space-y-3 border-t border-border pt-5">
                {face.weights.map((weight) => (
                  <div key={weight}>
                    <p className="text-body-s text-muted-foreground">
                      {WEIGHT_NAME[weight]}
                    </p>
                    <p
                      className={`text-h3 ${FACE_CLASS[id] ?? ""} ${WEIGHT_CLASS[weight] ?? ""}`}
                    >
                      {id === "cursive" ? SIGNATURE : SPECIMEN}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-lg border border-border p-6">
          <Eyebrow>Not for the UI</Eyebrow>
          <ul className="mt-3 space-y-2">
            {NON_UI_FACES.map((face) => (
              <li key={face.name} className="text-body-s">
                <span className="font-medium">{face.name}</span>{" "}
                <span className="text-muted-foreground">
                  ({face.kind}) — {face.usage}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        title="The type scale"
        caption="Each step is drawn at its real size, labelled with the numbers it is drawn from."
      >
        <div className="space-y-8">
          {TYPE_SCALE.map((step) => (
            <div key={step.id} className="border-b border-border pb-8">
              <p className="font-brand-mono text-body-s text-muted-foreground">
                {step.label} · {step.px}px
                {step.range ? ` (${step.range[0]}–${step.range[1]}px)` : ""} ·{" "}
                {step.weight} · {step.lineHeight} · {step.cssName}
              </p>
              <p className={STEP_CLASS[step.id] ?? ""}>{step.use}</p>
              {step.mobilePx !== null ? (
                <div className="mt-6">
                  <p className="font-brand-mono text-body-s text-muted-foreground">
                    mobile step · {step.mobilePx}px · {step.mobileSource} ·{" "}
                    {step.cssName}-mobile
                  </p>
                  <div className="mt-2 max-w-[360px] rounded-md border border-dashed border-border p-4">
                    <p className={STEP_MOBILE_CLASS[step.id] ?? ""}>
                      {step.use}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <ul className="mt-8 space-y-3">
          {Object.entries(TYPE_RULES).map(([id, rule]) => (
            <li key={id} className="rounded-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-brand-mono text-body-s text-primary">
                  {String(rule.value)}
                </span>
                <SourceTag source={rule.source} />
              </div>
              <p className="mt-1 text-body-s">{rule.statement}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radius" caption={RADIUS_GUIDANCE}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {RADIUS_SCALE.map((step) => (
            <div key={step.id}>
              <div
                className={`h-24 border border-border bg-accent ${RADIUS_CLASS[step.id] ?? ""}`}
              />
              <p className="mt-2 text-h4 font-medium">{step.id}</p>
              <p className="font-brand-mono text-body-s text-muted-foreground">
                {step.px}px · --radius-{step.id}
              </p>
              <p className="mt-1">
                <SourceTag source={step.source} />
              </p>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

import { BRAND, NEUTRALS, YTY_FAMILIES } from "../../src/tokens/brand";
import {
  FACES,
  MOBILE_FLOOR_PX,
  TYPE_SCALE,
} from "../../src/tokens/typography";
import {
  FACE_CLASS,
  FILL,
  STEP_CLASS,
  STEP_MOBILE_CLASS,
  WEIGHT_CLASS,
} from "./token-classes";

/**
 * The foundations floor.
 *
 * This page is seen, not read. A human opens it to check that things look
 * right; an agent reads the code to understand why. So it shows a thing and its
 * name and nothing else — no prose, no rationale, no numbers beyond a value's
 * own hex, no pass marks and no captions. What a colour is for, where a face
 * may and may not be set, why a step is the size it is: all of that lives in
 * the JSDoc on the token modules in `src/tokens/`, which is where it can be
 * read beside the value it governs and cannot rot into a paragraph nobody
 * updates. Every value drawn below is read from that source, so a token that
 * moves moves here too.
 */

const SPECIMEN = "Sogverse ABCÄÖ abcäö 0123";
const SIGNATURE = "Aino Virtanen";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-body-s text-muted-foreground">{children}</p>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20">
      <h2 className="text-h2">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Swatch({
  token,
  name,
  hex,
}: {
  token: string;
  name: string;
  hex: string;
}) {
  return (
    <div>
      <div className={`h-16 border border-border ${FILL[token] ?? ""}`} />
      <p className="mt-2 text-h4 font-medium">{name}</p>
      <p className="font-brand-mono text-body-s text-muted-foreground">{hex}</p>
    </div>
  );
}

export default function FoundationsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">SOG-UI</h1>

      <Section title="Ground and ink">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(NEUTRALS).map(([id, neutral]) => (
            <Swatch
              key={id}
              token={id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}
              name={neutral.name}
              hex={neutral.hex}
            />
          ))}
        </div>
      </Section>

      <Section title="The signature pair">
        <div className="grid gap-6 sm:grid-cols-2">
          {Object.entries(BRAND).map(([id, colour]) => (
            <Swatch
              key={id}
              token={id}
              name={colour.name}
              hex={colour.hex}
            />
          ))}
        </div>
      </Section>

      <Section title="The four families">
        <div className="space-y-8">
          {Object.entries(YTY_FAMILIES).map(([id, family]) => (
            <article key={id}>
              <h3 className="text-h3">{family.name}</h3>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {(["strong", "soft"] as const).map((variant) => (
                  <Swatch
                    key={variant}
                    token={`yty-${id}-${variant}`}
                    name={`${family.name} ${variant}`}
                    hex={family[variant]}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Type faces">
        <div className="space-y-10">
          {Object.entries(FACES).map(([id, face]) => (
            <article key={id}>
              <h3 className="text-h3">{face.name}</h3>
              <div className="mt-4 space-y-2">
                {face.weights.map((weight) => (
                  <p
                    key={weight}
                    className={`text-h3 ${FACE_CLASS[id] ?? ""} ${WEIGHT_CLASS[weight] ?? ""}`}
                  >
                    {id === "cursive" ? SIGNATURE : SPECIMEN}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="The type scale">
        <div className="space-y-8">
          {TYPE_SCALE.map((step) => (
            <div key={step.id} className="border-b border-border pb-8">
              <Label>{step.label}</Label>
              <p className={`mt-1 ${STEP_CLASS[step.id] ?? ""}`}>{SPECIMEN}</p>
              {step.mobilePx === null ? null : (
                <div className="mt-6">
                  <Label>{`${step.label} at ${MOBILE_FLOOR_PX}`}</Label>
                  {/* Mirrors MOBILE_FLOOR_PX in src/tokens/typography.ts. */}
                  <div className="mt-1 w-[360px] max-w-full border border-dashed border-border p-4">
                    <p className={STEP_MOBILE_CLASS[step.id] ?? ""}>
                      {SPECIMEN}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration page; nothing here ships to a user, so its copy deliberately stays out of messages/ (the same treatment the repo gives preview scenes) */
/**
 * THROWAWAY. This page exists so a mascot direction can be picked by looking
 * at five of them side by side. It is linked from nowhere, noindex, absent
 * from the sitemap, and written in literal English because no user will ever
 * read it.
 *
 * When a direction is chosen: delete this route, delete the four concepts that
 * lost, delete `ROUTES.mascot` and its entry in the proxy's `PUBLIC_ROUTES`,
 * and promote the survivor out of `src/components/mascot/concepts/` into the
 * real product surfaces.
 */

import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { CONCEPTS } from "@/components/mascot";
import { ConceptSection } from "@/components/mascot/exploration/concept-section";
import { Playground } from "@/components/mascot/exploration/playground";

export const metadata: Metadata = {
  title: "Mascot explorations",
  description: "Throwaway design exploration for a School of Gaming mascot fleet.",
  robots: { index: false, follow: false },
};

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export default function MascotExplorationPage() {
  return (
    <div className="mx-auto max-w-[92rem] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Throwaway exploration — delete once a direction is picked
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          A mascot fleet for School of Gaming
        </h1>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          Five base models, each one a parametric React component that draws itself from six
          independent tables: a species, a colourway, a pose, an expression, an outfit and
          whatever is in its hands. No image files, no illustrator round-trip — a pose is a pair
          of coordinates and an expression is two shapes, so a model can add either in a text
          editor without opening a drawing tool.
        </p>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          The job they have to do first is the awkward one: the product works with children and
          never publishes their pictures, so every hero image, email header and &ldquo;here is what
          a session looks like&rdquo; has a person-shaped hole in it. A base model that can be
          dressed as the child, the parent and the educator fills all three with one drawing.
          Every concept below is shown doing exactly that.
        </p>
        <nav className="flex flex-wrap gap-2 pt-2">
          {CONCEPTS.map((def) => (
            <a
              key={def.id}
              href={`#${def.id}`}
              className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {def.species}
            </a>
          ))}
          <a
            href="#playground"
            className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Playground
          </a>
        </nav>
      </header>

      <section id="playground" className="mb-12 scroll-mt-24">
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">Playground</h2>
        <p className="mb-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Every prop on the component, live. The stage is a fixed box, so nothing on the page
          moves as you flip through them.
        </p>
        <Playground />
      </section>

      <section className="mb-12 space-y-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">The five concepts</h2>
        {CONCEPTS.map((def) => (
          <ConceptSection key={def.id} conceptId={def.id} />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Notes &amp; honest read</h2>
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <Note title="What I would take forward">
              <p>
                <strong className="text-foreground">Kaveri as the base model, Ytymo as its
                companions.</strong> Kaveri is the only one of the five that actually solves the
                stated problem. A bear in a scarf is a bear in a scarf; it is not a parent. A
                person-shaped figure in a scarf is a parent, and the same figure in a headset is
                a kid and in a lanyard is a gedu — one drawing, three legible people, which is
                what a page with no photographs of children needs.
              </p>
              <p>
                Kaveri&rsquo;s weakness is that it is bland, and Ytymo fixes exactly that for
                free: a small element droplet floating beside a Kaveri is instantly ours, ties
                the art to lore the product already ships, and gives kids the collect-them-all
                instinct without a second cast to maintain. Person plus spark.
              </p>
            </Note>
            <Note title="Ranked on surviving 24 pixels">
              <p>
                First, the finding that applies to all five:{" "}
                <strong className="text-foreground">no full-body figure works below about
                48px.</strong> A whole person rendered 24 pixels tall gives the head six of
                them, and no amount of level-of-detail tuning fixes that — it is arithmetic.
                Every small use is therefore an <em>avatar crop</em>, and the ladders below are
                there to show you where each one gives up. Ranked on the crop, which is the case
                that matters:
              </p>
              <p>
                <strong className="text-foreground">1. Otso.</strong> Two ear circles do the
                whole job. The only one still unmistakable as a 24px full body, and the
                strongest silhouette in the set.
              </p>
              <p>
                <strong className="text-foreground">2. Konsu.</strong> Hard rectangle head, two
                lit blocks on a dark screen — the highest contrast here. Reads at 32 full-body,
                and its head crop is the cleanest of the five.
              </p>
              <p>
                <strong className="text-foreground">3. Ytymo.</strong> The egg plus the sign
                overhead is a surprisingly good small shape — the sign is the bit that survives
                and it is also the bit that tells the four elements apart, which is lucky.
              </p>
              <p>
                <strong className="text-foreground">4. Kaveri.</strong> Fails full-body early
                and recovers completely in the bust crop, where the hair silhouette and the
                hood do the identifying. Acceptable, because avatars are the only small use.
              </p>
              <p>
                <strong className="text-foreground">5. Taitto.</strong> Last, and it surprised
                me: the facets are close in value, so below ~32px the whole figure flattens to
                one amber lozenge. Its head crop is excellent — the problem is only the body.
              </p>
            </Note>
            <Note title="Ranked on how much dressing-up they can carry">
              <p>
                <strong className="text-foreground">Kaveri</strong> — the only one where an
                outfit reads as clothing rather than as a costume. The obvious candidate if
                gamers ever get to customise their own.
              </p>
              <p>
                <strong className="text-foreground">Otso</strong> — an animal in a hat is a
                hundred-year-old formula and it works. Hats must clear the ears.
              </p>
              <p>
                <strong className="text-foreground">Konsu</strong> — wears everything, and
                everything reads as a costume. Funny, but a hat competes with the antenna.
              </p>
              <p>
                <strong className="text-foreground">Taitto</strong> — soft goods fight the folds.
                Planes on planes only: capes, party hats, shades.
              </p>
              <p>
                <strong className="text-foreground">Ytymo</strong> — no shoulders, so no sleeves.
                Hats, scarves, capes and ground props; nothing tailored.
              </p>
            </Note>
            <Note title="Where the fleet would actually live">
              <p>
                Home hero (the introducer waving, big). The Yty section (one droplet per element,
                already the right colours). Empty states — no clubs yet, no sessions yet, no
                messages — where a small character pointing at the call to action is worth more
                than an icon. The 404. Email headers, at bust crop beside the greeting. Loading
                states. Avatar fallbacks next to a gamer&rsquo;s name where no picture exists,
                which is every gamer.
              </p>
            </Note>
            <Note title="How the static export works">
              <p>
                There are no gradients, no filters, no clip paths and no external references
                anywhere in the art — every fill and coordinate is a plain attribute, and the
                only stylesheet is the handful of keyframes each instance writes inside its own
                SVG. So the <em>Copy SVG markup</em> button is not a conversion step: it takes the
                rendered <code className="text-foreground">outerHTML</code> and that is already a
                valid standalone file, animation included. Turning the animation off leaves the
                identical still image an email client or a rasteriser would see.
              </p>
              <p>
                A build-time export would be the same idea from the other end:
                render-to-string the component for the combinations you want and write the files
                out. Nothing in the component would need to change.
              </p>
            </Note>
            <Note title="Directions I did not build">
              <p>
                <strong className="text-foreground">A pixel-art sprite fleet.</strong> Perfect at
                icon size and genuinely gamer-native, but it cannot scale up for a hero and every
                new pose is hand-placed pixels — the opposite of maintainable in code.
              </p>
              <p>
                <strong className="text-foreground">A mask/helmet species</strong> where the
                character is a costume and the wearer is never shown. Elegant answer to the
                no-photographs problem, but it reads as anonymous rather than as friendly.
              </p>
              <p>
                <strong className="text-foreground">Animal-per-role</strong> — an owl gedu, a fox
                gamer, a moose parent. Charming and completely unmaintainable: five species means
                five pose sheets, which is exactly the trap this architecture exists to avoid.
              </p>
              <p>
                <strong className="text-foreground">A single mascot with no fleet.</strong> Worth
                considering seriously if the fleet turns out to be more cast than the site can
                carry.
              </p>
            </Note>
            <Note title="Known rough edges">
              <p>
                A hat and a species accent compete for the same space — a witch hat on a Konsu
                hides its antenna, and on a Ytymo it crowds the element sign. Fixable by having
                the crown yield when the hat slot is filled; not done, because which one should
                win is a design call rather than a bug.
              </p>
              <p>
                The jump pose lifts the legs but not the body, so it reads as a star jump rather
                than as air. A per-pose body lift would fix it and would automatically carry the
                hat with it, since accessories draw inside the pose&rsquo;s transform.
              </p>
              <p>
                Trademark safety: no controller, keyboard, console or headset here copies a real
                device silhouette, and nothing carries a mark. The Konsu chassis is deliberately
                a generic slab rather than any handheld you could name.
              </p>
            </Note>
            <Note title="On motion">
              <p>
                Idle animation is always on by explicit product decision — no
                reduced-motion gate. In exchange the amplitude is the safeguard: a 2.5px rise, a
                2% breath, a blink, and a degree and a half of head tilt, all on slow loops with
                nothing that flashes or parallaxes. Each instance is phase-offset from its id so
                a row of characters does not blink in lockstep. Pass{" "}
                <code className="text-foreground">animated={"{false}"}</code> and the picture is
                identical, standing still.
              </p>
            </Note>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration page; nothing here ships to a user, so its copy deliberately stays out of messages/ (the same treatment the repo gives preview scenes) */
/**
 * THROWAWAY. This page exists so a mascot direction can be picked by looking
 * at the options side by side. It is linked from nowhere, noindex, absent from
 * the sitemap, and written in literal English because no user will ever read
 * it.
 *
 * When a direction is chosen: delete this route, delete the concepts that
 * lost, delete `ROUTES.mascot` and its entry in the proxy's `PUBLIC_ROUTES`,
 * delete the `-legacy` comparison modules and the `faceStyle` / `limbStyle`
 * props that only exist to feed them, and promote the survivor out of
 * `src/components/mascot/concepts/` into the real product surfaces.
 */

import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { CONCEPTS } from "@/components/mascot";
import { AvatarStudy } from "@/components/mascot/exploration/avatars";
import { ConceptSection } from "@/components/mascot/exploration/concept-section";
import { Collapsible } from "@/components/mascot/exploration/controls";
import { Playground } from "@/components/mascot/exploration/playground";
import {
  AnimalLineup,
  ArmStudy,
  DeskScene,
  FaceStudy,
  KaveriFamily,
  MotionRow,
  SeasonStrip,
  TaittoBranches,
} from "@/components/mascot/exploration/studies";

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

const JUMPS: readonly { id: string; label: string }[] = [
  { id: "faces", label: "Faces" },
  { id: "motion", label: "Motion" },
  { id: "arms", label: "Arms" },
  { id: "taitto", label: "Taitto branches" },
  { id: "kaveri", label: "Kaveri family" },
  { id: "animals", label: "Animals" },
  { id: "desk", label: "Desk" },
  { id: "seasons", label: "Seasons" },
  { id: "avatars", label: "Avatars" },
  { id: "playground", label: "Playground" },
  { id: "deep", label: "Deep dives" },
];

export default function MascotExplorationPage() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Round two — throwaway exploration, delete once a direction is picked
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          A mascot fleet for School of Gaming
        </h1>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          Eight base models, each one a parametric React component that draws itself from seven
          independent tables: a species, a build, a colourway, a pose, an expression, an outfit
          and whatever is in its hands. No image files, no illustrator round-trip — a pose is a
          pair of coordinates and an expression is two shapes, so a model can add either in a text
          editor without opening a drawing tool.
        </p>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          The job they have to do first is the awkward one: the product works with children and
          never publishes their pictures, so every hero image, email header and &ldquo;here is what
          a session looks like&rdquo; has a person-shaped hole in it. A base model that can be
          dressed as the child, the parent and the educator fills all three with one drawing.
        </p>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          Round two answered eight pieces of feedback, and the first two are the ones worth
          judging hardest: <strong className="text-foreground">the faces were creepy</strong>, and{" "}
          <strong className="text-foreground">the animation was too timid to read as
          deliberate</strong>. Both were rebuilt rather than tuned, and both are shown next to what
          they replaced.
        </p>
        <nav className="flex flex-wrap gap-2 pt-2">
          {JUMPS.map((jump) => (
            <a
              key={jump.id}
              href={`#${jump.id}`}
              className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {jump.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="space-y-12">
        <section id="faces" className="scroll-mt-24">
          <FaceStudy />
        </section>

        <section id="motion" className="scroll-mt-24">
          <MotionRow />
        </section>

        <section id="arms" className="scroll-mt-24">
          <ArmStudy />
        </section>

        <section id="taitto" className="scroll-mt-24">
          <TaittoBranches />
        </section>

        <section id="kaveri" className="scroll-mt-24">
          <KaveriFamily />
        </section>

        <section id="animals" className="scroll-mt-24">
          <AnimalLineup />
        </section>

        <section id="desk" className="scroll-mt-24">
          <DeskScene />
        </section>

        <section id="seasons" className="scroll-mt-24">
          <SeasonStrip />
        </section>

        <section id="avatars" className="scroll-mt-24">
          <AvatarStudy />
        </section>

        <section id="playground" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Playground</h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Every prop on the component, live. The stage is a fixed box, so nothing on the page
              moves as you flip through them.
            </p>
          </div>
          <Playground />
        </section>

        <section id="deep" className="scroll-mt-24 space-y-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Deep dive, one concept at a time
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Everything about a single species: builds, colourways, the full pose sheet, the six
              expressions, the three roles, dress-up, the scale ladder, the silhouette test, the
              avatar crops and the named fleet. Closed by default — each one is forty-odd
              characters and eight of them at once is a page nobody reaches the bottom of.
            </p>
          </div>
          {CONCEPTS.map((def) => (
            <Collapsible key={def.id} title={def.species} subtitle={def.kind}>
              <ConceptSection conceptId={def.id} />
            </Collapsible>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Notes &amp; honest read
          </h2>
          <Card>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <Note title="What I would take forward">
                <p>
                  <strong className="text-foreground">The Kaveri family as the base model, the
                  animal family as the second cast, and Kaari as the brand shape.</strong> Kaveri
                  is still the only concept that solves the stated problem — a bear in a scarf is a
                  bear in a scarf, it is not a parent — and turning it into six builds is what
                  turns &ldquo;a mascot&rdquo; into &ldquo;the people on this website&rdquo;. The
                  animals are the emotional range Kaveri does not have, and they now cost almost
                  nothing to keep.
                </p>
                <p>
                  Kaari is the recommendation from the fold branches: it keeps what made Taitto
                  fresh and gives back the warmth that made it unusable on a parent-facing page.
                  Kide is the one to keep in the drawer for anything competitive; Nappi is the one
                  to reach for wherever the render is small.
                </p>
              </Note>
              <Note title="What changed since round one">
                <p>
                  <strong className="text-foreground">Faces.</strong> No sclera anywhere; the mood
                  is carried by eye shape; no mouth wider than a third of a head.
                </p>
                <p>
                  <strong className="text-foreground">Motion.</strong> Every pose owns its
                  animation, at amplitudes that read as intentional.
                </p>
                <p>
                  <strong className="text-foreground">Arms.</strong> Two tapered segments and a
                  derived joint, replacing one bowed stroke.
                </p>
                <p>
                  <strong className="text-foreground">Builds.</strong> A third axis, which turned
                  &ldquo;could Kaveri be a family&rdquo; and &ldquo;could Otso be more than a
                  bear&rdquo; into one feature.
                </p>
                <p>
                  <strong className="text-foreground">Furniture, seasons, and avatars.</strong> A
                  desk to sit at, a calendar that dresses the cast, and a portrait system that is
                  a candidate replacement for the identicon.
                </p>
              </Note>
              <Note title="Ytymo and Konsu, honestly">
                <p>
                  <strong className="text-foreground">Ytymo is no longer an egg.</strong> The
                  silhouette was rebuilt around a broken top line — two licks off a central notch —
                  because no amount of tinting fixes an ovoid, and the Finnish reading of
                  &ldquo;egg&rdquo; is a reason to change the shape rather than the colour. It is
                  still best as a companion beside a bigger character rather than as the character.
                </p>
                <p>
                  <strong className="text-foreground">Konsu got a handle and the four
                  elements</strong>, and not much else, deliberately. A carry handle is a thing you
                  take to a club, and the element pips are iconography nobody else can copy. If
                  that still reads as anyone&rsquo;s robot, park it — it is not where the effort
                  should go.
                </p>
              </Note>
              <Note title="Ranked on surviving 24 pixels">
                <p>
                  The round-one finding still holds and is arithmetic:{" "}
                  <strong className="text-foreground">no full-body figure works below about
                  48px</strong>, because a whole person 24 pixels tall gives the head six of them.
                  Every small use is an avatar crop, which is what the avatar section is about.
                </p>
                <p>
                  On the crop: <strong className="text-foreground">Nappi</strong> first — two heads
                  tall means the full body and the portrait are nearly the same picture. Then{" "}
                  <strong className="text-foreground">the animals</strong>, whose ears do the whole
                  job, then <strong className="text-foreground">Konsu</strong>, then{" "}
                  <strong className="text-foreground">Kaari</strong>, then{" "}
                  <strong className="text-foreground">Kaveri</strong>, which fails full-body early
                  and recovers completely in the bust crop. <strong className="text-foreground">Kide</strong>{" "}
                  is last: thin limbs are the first thing to vanish.
                </p>
              </Note>
              <Note title="How the static export works">
                <p>
                  There are no gradients, no filters, no clip paths and no external references
                  anywhere in the art — every fill and coordinate is a plain attribute, and the
                  only stylesheet is the handful of keyframes each instance writes inside its own
                  SVG. So the <em>Copy SVG markup</em> button is not a conversion step: it takes
                  the rendered <code className="text-foreground">outerHTML</code> and that is
                  already a valid standalone file, animation included. Turning the animation off
                  leaves the identical still image an email client or a rasteriser would see —
                  which is why a jump&rsquo;s key frame is the apex and not the ground.
                </p>
              </Note>
              <Note title="Known rough edges">
                <p>
                  A hat and a species accent still compete on Ytymo, where the element sign has to
                  yield. Konsu&rsquo;s handle no longer has that problem, which is the shape of the
                  fix if it is ever wanted elsewhere.
                </p>
                <p>
                  The seated pose assumes a desk. Without one in the scene slot the legs read as a
                  character sitting on nothing, which is honest — a seat is furniture, not a pose.
                </p>
                <p>
                  Trademark safety: no controller, keyboard, console, chair or headset here copies
                  a real device silhouette, and nothing carries a mark. The Konsu chassis is
                  deliberately a generic slab rather than any handheld you could name.
                </p>
              </Note>
              <Note title="Directions still not built">
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
                  <strong className="text-foreground">A single mascot with no fleet.</strong> Worth
                  considering seriously if the fleet turns out to be more cast than the site can
                  carry.
                </p>
              </Note>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

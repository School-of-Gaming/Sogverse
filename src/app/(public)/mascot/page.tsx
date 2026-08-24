/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration page; nothing here ships to a user, so its copy deliberately stays out of messages/ (the same treatment the repo gives preview scenes) */
/**
 * THROWAWAY. This page exists so a mascot direction can be picked by looking
 * at the options side by side. It is linked from nowhere, noindex, absent from
 * the sitemap, and written in literal English because no user will ever read
 * it.
 *
 * It is also, for now, a **review document**: the whole exploration is handed
 * to the School of Gaming team through this one URL, so every study that
 * exists has to be reachable from here. That is the ordering principle below —
 * sections run in the order the decisions want to be made in, each one opens
 * with a lede saying what the reader is looking at and the one question to
 * form an opinion on, and nothing is left rendering only in a file. The
 * throwaway framing lives in this comment rather than in the visible header,
 * because a reader who has been asked for an opinion does not need to be told
 * first that the thing they are looking at is disposable.
 *
 * Every section carries a stable `id`, because the team share links to them.
 * Renaming one breaks somebody's bookmark; adding one costs nothing.
 *
 * When a direction is chosen: delete this route, delete the concepts that
 * lost, delete `ROUTES.mascot` and its entry in the proxy's `PUBLIC_ROUTES`,
 * delete `public/mascot-legacy/` and the legacy comparison section,
 * delete the `-legacy` comparison modules and the `faceStyle` / `limbStyle`
 * props that only exist to feed them, and promote the survivor out of
 * `src/components/mascot/concepts/` into the real product surfaces.
 */

import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { CONCEPTS } from "@/components/mascot";
import { AnimalLineup } from "@/components/mascot/exploration/animal-lineup";
import { AvatarStudy } from "@/components/mascot/exploration/avatars";
import { BackViewSpike } from "@/components/mascot/exploration/back-view";
import { ConceptSection } from "@/components/mascot/exploration/concept-section";
import { Collapsible } from "@/components/mascot/exploration/controls";
import { DeskScene, SeasonStrip } from "@/components/mascot/exploration/dressing";
import { ArmStudy, TaittoBranches } from "@/components/mascot/exploration/earlier-rounds";
import { FaceStudy } from "@/components/mascot/exploration/face-study";
import { GalaksiCrew } from "@/components/mascot/exploration/galaksi";
import { HumanoidRow } from "@/components/mascot/exploration/humanoids";
import { JaloStudy } from "@/components/mascot/exploration/jalo";
import { KaveriFamily } from "@/components/mascot/exploration/kaveri-family";
import { KylaVillage } from "@/components/mascot/exploration/kyla-village";
import {
  LegacyCastStrip,
  LegacyMinionStrip,
  LegacyOverview,
} from "@/components/mascot/exploration/legacy";
import { LohiCast } from "@/components/mascot/exploration/lohi";
import { BerriesAndMushrooms } from "@/components/mascot/exploration/marja-sieni";
import { MetsaForest } from "@/components/mascot/exploration/metsa-forest";
import { MotionRow } from "@/components/mascot/exploration/motion";
import { PalikkaLine } from "@/components/mascot/exploration/palikka-line";
import { Playground } from "@/components/mascot/exploration/playground";
import { PorukkaFamily } from "@/components/mascot/exploration/porukka-family";
import { ReksiRiffs } from "@/components/mascot/exploration/reksi";
import { SaaristoPack } from "@/components/mascot/exploration/saaristo";
import { SilmuRainbow } from "@/components/mascot/exploration/silmu-rainbow";
import { SimplicityAudit } from "@/components/mascot/exploration/simplicity";
import { StadiFamily } from "@/components/mascot/exploration/stadi-family";
import { SurfaceIdeas } from "@/components/mascot/exploration/surfaces";
import { ChiefEngineerIdeas, GardenerSpotlight } from "@/components/mascot/exploration/team";
import { ViewportSection } from "@/components/mascot/exploration/viewport-section";
import { WalkInSpike } from "@/components/mascot/exploration/walk-in";

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

/**
 * The heading a section opens with.
 *
 * Every section on this page has one, in the same place and at the same
 * weight, so the page reads as a document with chapters rather than as a pile
 * of cards. The `lede` says why the section exists and what opinion is being
 * asked for — never what the pictures under it are doing, which the pictures
 * are already doing.
 */
function SectionHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/** One entry in the ruled-out list: the idea, why it lost, and where to look. */
function RuledOut({
  idea,
  because,
  evidence,
  href,
}: {
  idea: string;
  because: string;
  evidence: string;
  href?: string;
}) {
  return (
    <li className="border-l-2 border-border pl-4">
      <p className="text-sm font-semibold text-foreground">{idea}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{because}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Evidence:{" "}
        {href === undefined ? (
          <span className="italic">{evidence}</span>
        ) : (
          <a href={href} className="text-primary underline underline-offset-2">
            {evidence}
          </a>
        )}
      </p>
    </li>
  );
}

/**
 * The jump nav, and the page's table of contents.
 *
 * Kept in the same order as the sections themselves and generated from this
 * one list, so a section added below without an entry here is a section
 * nobody finds.
 */
/**
 * Placeholder heights (px) for skipped sections — what `contain-intrinsic-size`
 * reserves while `content-visibility: auto` skips a section's layout and
 * paint. Estimated from the served page at the default desktop width and
 * written down rather than measured at runtime (the repo's layout rule). The
 * accepted tolerance is a few hundred pixels per section: the correction
 * happens off-screen as a section realises, and on a page this tall it is
 * under half a percent of scroll travel.
 */
const SECTION_HEIGHTS: Record<string, number> = {
  faces: 1400,
  people: 3200,
  legacy: 2600,
  silmu: 2200,
  jalo: 1800,
  animals: 3800,
  "more-species": 2600,
  palikka: 1400,
  team: 2600,
  simplicity: 3200,
  surfaces: 2200,
  motion: 1200,
  spikes: 1800,
  dressing: 2400,
  avatars: 2200,
  playground: 1400,
  earlier: 300,
};
/** One expanded deep dive is roughly this tall. */
const DEEP_DIVE_HEIGHT = 4200;

const JUMPS: readonly { id: string; label: string }[] = [
  { id: "faces", label: "The face" },
  { id: "people", label: "The people" },
  { id: "legacy", label: "Legacy" },
  { id: "silmu", label: "Silmu" },
  { id: "jalo", label: "Jalo" },
  { id: "animals", label: "The animals" },
  { id: "more-species", label: "More of the cast" },
  { id: "palikka", label: "Palikka" },
  { id: "team", label: "The team" },
  { id: "simplicity", label: "Simplicity" },
  { id: "surfaces", label: "From the pages" },
  { id: "motion", label: "Motion" },
  { id: "spikes", label: "Spikes" },
  { id: "dressing", label: "Dressing up" },
  { id: "avatars", label: "Avatars" },
  { id: "playground", label: "Playground" },
  { id: "notes", label: "Notes" },
  { id: "questions", label: "Open questions" },
  { id: "ruled-out", label: "Ruled out" },
  { id: "earlier", label: "Earlier rounds" },
  { id: "deep", label: "Deep dives" },
];

export default function MascotExplorationPage() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 py-10 sm:px-6 lg:px-8">
      {/* Sections more than a viewport away stop ticking their animations —
          content-visibility skips their paint, but an unpainted CSS animation
          still burns style recalculation, and this page carries thousands of
          keyframe channels. Literal class name on purpose (Tailwind scans). */}
      <style>{".mascot-offstage * { animation-play-state: paused !important; }"}</style>
      <header className="mb-10 space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          A mascot fleet for School of Gaming
        </h1>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          We are drawing a cast of characters for School of Gaming, in code rather than in a
          drawing tool — every figure on this page is a React component that assembles itself
          from a species, a build, a colour, a pose, an expression, an outfit and whatever is in
          its hands. The job comes before the fun: the product works with children and never
          publishes their pictures, so every hero image, email header and &ldquo;here is what a
          session looks like&rdquo; has a person-shaped hole in it. Whatever we pick has to be
          able to stand in for a gamer, for a parent and for a gedu — and be worth looking at
          the rest of the time.
        </p>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          The design philosophy, as it stands today, is{" "}
          <strong className="text-foreground">simplicity</strong>. A character is its silhouette
          and one or two flat colours, and nothing else is drawn on it — no seams, sheen,
          freckles or trim. Props are the only thing we add, because a quiet body is what lets a
          hat or a paintbrush read as fun instead of as noise. The face is a symbol rather than a
          drawing: an eye is a white ellipse and a pupil, a mouth is a small curve, and mood is
          four dials moving. Feet stay on the ground. Colours are taken from the palettes the
          product already owns rather than invented, which is why a character can be recoloured
          into any of our voice zones without asking anybody.
        </p>
        <p className="max-w-4xl text-base leading-relaxed text-muted-foreground">
          <strong className="text-foreground">What to do with this page:</strong> look through
          it, form an opinion, and tell Kyle. Naming the section is the whole trick — &ldquo;the
          people, the second row&rdquo; or &ldquo;the animals at 40 pixels&rdquo; is worth ten
          times &ldquo;I like the blue one&rdquo;. Every section says at the top which one
          question it is asking; disagreeing with the question is useful feedback too. Nothing
          here is decided, and no amount of work in a section is a reason to keep it.
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

      <div className="space-y-14">
        <ViewportSection id="faces" estimatedHeight={SECTION_HEIGHTS["faces"]}>
          <SectionHeader title="The face">
            Everything else on this page inherits this. Two rounds of faces were called creepy
            and soulless, and the fix was not to draw them better — it was to stop drawing a face
            at all and build a symbol out of flat shapes, with every realism cue (highlights,
            blush, teeth, lid lines) banned outright on every species. All three rounds are here,
            newest first. The question: does the live one read as a character you would want to
            meet, at every mood?
          </SectionHeader>
          <FaceStudy />
        </ViewportSection>

        <ViewportSection id="people" estimatedHeight={SECTION_HEIGHTS["people"]}>
          <SectionHeader title="The people">
            <strong className="text-foreground">This is the decision that matters most.</strong>{" "}
            The person-shaped hole is the reason this project exists, and an animal in a scarf
            does not fill it — so one of these three families is the base model, or we do not
            have one. They are built under a ruling worth knowing: we are not copying anybody. We
            study a Finnish illustration lineage for its grammar — line, colour discipline,
            proportion, mood — and then draw our own; the test is &ldquo;feels Finnish&rdquo;,
            never &ldquo;looks like&rdquo;. Kaveri is our own shape from round one. Porukka
            learns from the flat, outline-free neuvola idiom (Mari Huhtala&rsquo;s Terveyskylä
            work). Stadi learns from the City of Helsinki&rsquo;s thick-ink illustration lineage.
            The question: which of the three is the one you would want to be met by?
          </SectionHeader>
          <HumanoidRow />
          <div id="kaveri" className="scroll-mt-24">
            <KaveriFamily />
          </div>
          <div id="porukka" className="scroll-mt-24">
            <PorukkaFamily />
          </div>
          <div id="stadi" className="scroll-mt-24">
            <StadiFamily />
          </div>
        </ViewportSection>

        <ViewportSection id="legacy" estimatedHeight={SECTION_HEIGHTS["legacy"]}>
          <LegacyOverview />
        </ViewportSection>

        <ViewportSection id="silmu" estimatedHeight={SECTION_HEIGHTS["silmu"]}>
          <SectionHeader title="Silmu — the mascot we already had">
            The old one-eyed blob, rebuilt into the same system as everything else and renamed,
            because &ldquo;Minion&rdquo; belongs to Universal. Its identity used to be a hat,
            which worked on white paper at 300 pixels and stops working on a dark page at 40. The
            counter-proposal is colour: the same drawing in every colour the product owns. Two
            questions, and they pull against each other — can you tell twenty-five of them apart
            at avatar size, and does the shape still read as somebody else&rsquo;s character even
            after the rename?
          </SectionHeader>
          <div id="rainbow" className="scroll-mt-24">
            <SilmuRainbow />
          </div>
          <div id="legacy-minion" className="scroll-mt-24">
            <LegacyMinionStrip />
          </div>
        </ViewportSection>

        <ViewportSection id="jalo" estimatedHeight={SECTION_HEIGHTS["jalo"]}>
          <SectionHeader title="Jalo — the mark that grew feet">
            The other way to answer the same question Silmu answers: instead of a character that
            becomes the brand, the brand mark itself gets a face and two legs. The favicon path
            in every figure here is literally the same path string as the one in the browser tab.
            The question: is a logo that walks around charming, or is it the moment a company
            stops having characters and starts having a mascot of itself?
          </SectionHeader>
          <JaloStudy />
        </ViewportSection>

        <ViewportSection id="animals" estimatedHeight={SECTION_HEIGHTS["animals"]}>
          <SectionHeader title="The animals">
            One rig, a head and a tail per species, so a twentieth animal costs about thirty
            lines. This is the cast with the emotional range the humanoids do not have, and it is
            the strongest thing in the set at avatar size — an ear survives 28 pixels where a
            whole person does not. Below the lineup: the legacy pun cast beside whatever now
            stands for each, and then two concepts that ask a different question than &ldquo;is
            this a nice bear&rdquo; — whether a School of Gaming picture can be a *place with
            people busy in it* rather than a character on a background. The question: is the
            second cast worth having at all, and which of these worlds do you want to live in?
          </SectionHeader>
          <AnimalLineup />
          <div id="legacy-cast" className="scroll-mt-24">
            <LegacyCastStrip />
          </div>
          <div id="kyla" className="scroll-mt-24">
            <KylaVillage />
          </div>
          <div id="metsa" className="scroll-mt-24">
            <MetsaForest />
          </div>
        </ViewportSection>

        <ViewportSection id="more-species" estimatedHeight={SECTION_HEIGHTS["more-species"]}>
          <SectionHeader title="More of the cast">
            Three sets that are neither people nor animals, each built to test something the
            other sections cannot. The berries and mushrooms ask whether colour alone can tell
            two characters apart when they are the same drawing twice. The dragons ask whether a
            species can carry three ages on one rig with no costume difference anywhere. The
            alien crew asks whether a *crew* is a thing we can draw — several characters in one
            frame doing different jobs. The question: does the fleet want this many species, or
            is a big cast the thing that stops any of them being recognisable?
          </SectionHeader>
          <div id="marja-sieni" className="scroll-mt-24">
            <BerriesAndMushrooms />
          </div>
          <div id="lohi" className="scroll-mt-24">
            <LohiCast />
          </div>
          <div id="galaksi" className="scroll-mt-24">
            <GalaksiCrew />
          </div>
        </ViewportSection>

        <ViewportSection id="palikka" estimatedHeight={SECTION_HEIGHTS["palikka"]}>
          <SectionHeader title="Palikka — the voxel line">
            Two of the thirty-four legacy files are blocky animals, and the first pass refused
            them for looking like Minecraft. That refusal was overturned: the rule forbids
            rebuilding somebody else&rsquo;s character, not building out of cubes. So the line
            exists, and the check it still owes is commercial rather than artistic — we are a
            Roblox partner, and this is what somebody would be looking at while deciding whether
            that is a problem. The question: would you be comfortable putting this in front of a
            partner?
          </SectionHeader>
          <PalikkaLine />
        </ViewportSection>

        <ViewportSection id="team" estimatedHeight={SECTION_HEIGHTS["team"]}>
          <SectionHeader title="The team">
            Three characters that stand for real people here rather than for a user role: the
            Gardener who tends the stories, Reksi the Princi-Pal in both of the bodies the legacy
            set drew him in, and the Chief Engineer, who has never existed and is therefore a row
            of candidates rather than a drawing. Handles only — no real names in the art. The
            question for the last two: which body is Reksi, and which candidate is the engineer?
          </SectionHeader>
          <GardenerSpotlight />
          <div id="reksi" className="scroll-mt-24">
            <ReksiRiffs />
          </div>
          <div id="engineer" className="scroll-mt-24">
            <ChiefEngineerIdeas />
          </div>
        </ViewportSection>

        <ViewportSection id="simplicity" estimatedHeight={SECTION_HEIGHTS["simplicity"]}>
          <SimplicityAudit />
        </ViewportSection>

        <ViewportSection id="surfaces" estimatedHeight={SECTION_HEIGHTS["surfaces"]}>
          <SurfaceIdeas />
        </ViewportSection>

        <ViewportSection id="motion" estimatedHeight={SECTION_HEIGHTS["motion"]}>
          <SectionHeader title="Motion">
            Every pose owns a real animation rather than a shared wobble — walking walks, jumping
            jumps, typing types — and the standing one is the one to watch: it breathes, blinks
            and shifts its weight, and the soles never leave the ground. A character that lifts
            off at rest is hovering, and a hovering character is pasted onto a page rather than
            standing in it. The question: does the idle look alive, or does it look busy?
          </SectionHeader>
          <MotionRow />
        </ViewportSection>

        <ViewportSection id="spikes" estimatedHeight={SECTION_HEIGHTS["spikes"]}>
          <SectionHeader title="Spikes — deliberate one-file experiments">
            Two questions that could not be answered by arguing, each answered by building the
            thing once in a single throwaway file that nothing else imports. They get promoted
            into the real model or deleted; they never get patched. The question for both: is
            this worth the second drawing of every species it would cost?
          </SectionHeader>
          <div id="walk-in" className="scroll-mt-24 space-y-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Can a character walk in from off screen and
              turn to face you?</strong> The profile is hand-drawn; the figure it hands off to at
              the end of the turn is the real component.
            </p>
            <WalkInSpike />
          </div>
          <div id="back-view" className="scroll-mt-24 space-y-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">What would a back view cost, and would the
              cape, backpack and balloons finally be visible?</strong> A character with its back
              to you is looking at what you are looking at — the one legacy drawing of it is the
              most expressive file in the folder.
            </p>
            <BackViewSpike />
          </div>
        </ViewportSection>

        <ViewportSection id="dressing" estimatedHeight={SECTION_HEIGHTS["dressing"]}>
          <SectionHeader title="Dressing up">
            Clothes, furniture, weather and places, none of which belong to any one species. A
            season is a set of accessories resolved from today&rsquo;s date in Helsinki, a desk
            is a scene layer that draws a chair behind the character and a surface in front, and
            the archipelago pack is the hardest version of the test: one wardrobe and two places
            put on four bodies that share nothing but a rig. The rest of the wardrobe — the door,
            the sign-painting and the engine room, and every prop — is in the playground and in
            each deep dive below. The question: does dress-up make these feel like a cast, or
            like one drawing in costumes?
          </SectionHeader>
          <div id="seasons" className="scroll-mt-24">
            <SeasonStrip />
          </div>
          <div id="desk" className="scroll-mt-24">
            <DeskScene />
          </div>
          <div id="saaristo" className="scroll-mt-24">
            <SaaristoPack />
          </div>
        </ViewportSection>

        <ViewportSection id="avatars" estimatedHeight={SECTION_HEIGHTS["avatars"]}>
          <SectionHeader title="Avatars">
            A side track on the same machinery, and the most likely first place any of this ships.
            Today every user gets an identicon — a pixel grid seeded from their id — and the
            complaint is that you cannot tell who is who. Here are twenty-four fixture people
            drawn both ways at the sizes a participant list actually renders. The question: at 28
            pixels, can you find the same person twice?
          </SectionHeader>
          <AvatarStudy />
        </ViewportSection>

        <ViewportSection id="playground" estimatedHeight={SECTION_HEIGHTS["playground"]}>
          <SectionHeader title="Playground">
            Every control on the component, live, on a fixed stage so nothing on the page moves
            as you flip through them. This is the place to try the combination you have in mind
            rather than the ones we chose to show you.
          </SectionHeader>
          <Playground />
        </ViewportSection>

        <section id="notes" className="scroll-mt-24 space-y-4">
          <SectionHeader title="Notes on how this is built">
            The things worth knowing that are not a picture: what survives at small sizes, how
            these become files an email can carry, and where the system is currently rough.
          </SectionHeader>
          <Card>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <Note title="Ranked on surviving 24 pixels">
                <p>
                  The finding that shapes everything and is really just arithmetic:{" "}
                  <strong className="text-foreground">no full-body figure works below about
                  48px</strong>, because a whole person 24 pixels tall gives the head six of them.
                  Every small use is an avatar crop, which is what the avatar section is about.
                </p>
                <p>
                  On the crop: <strong className="text-foreground">the animals</strong> first,
                  whose ears do the whole job, then{" "}
                  <strong className="text-foreground">Silmu</strong>, then{" "}
                  <strong className="text-foreground">Nappi</strong> — two heads tall means the
                  full body and the portrait are nearly the same picture — then{" "}
                  <strong className="text-foreground">Konsu</strong>,{" "}
                  <strong className="text-foreground">Kaari</strong> and the humanoids, which
                  fail full-body early and recover completely in the bust.{" "}
                  <strong className="text-foreground">Kide</strong> is last: thin limbs are the
                  first thing to vanish.
                </p>
              </Note>
              <Note title="How these become files">
                <p>
                  There are no gradients, no filters, no clip paths and no external references
                  anywhere in the art — every fill and coordinate is a plain attribute, and the
                  only stylesheet is the handful of keyframes each figure writes inside its own
                  SVG. So the <em>Copy SVG markup</em> button in the playground is not a
                  conversion step: what it copies is already a valid standalone file, animation
                  included. Turning the animation off leaves the identical still image an email
                  client or a rasteriser would see — which is why a jump&rsquo;s key frame is the
                  apex and not the ground.
                </p>
              </Note>
              <Note title="Ytymo and Konsu, honestly">
                <p>
                  <strong className="text-foreground">Ytymo is no longer an egg.</strong> The
                  silhouette was rebuilt around a broken top line — two licks off a central notch
                  — because no amount of tinting fixes an ovoid, and the Finnish reading of
                  &ldquo;egg&rdquo; is a reason to change the shape rather than the colour. It is
                  still best as a companion beside a bigger character rather than as the
                  character.
                </p>
                <p>
                  <strong className="text-foreground">Konsu got a handle and the four
                  elements</strong>, and not much else, deliberately. A carry handle is a thing
                  you take to a club, and the element pips are iconography nobody else can copy.
                  If it still reads as anyone&rsquo;s robot, park it — it is not where the effort
                  should go.
                </p>
              </Note>
              <Note title="Known rough edges">
                <p>
                  A hat and a species accent still compete on Ytymo, where the element sign has
                  to yield. A tall hat clips the top of the canvas in the jumping pose. The
                  seated pose assumes a desk — without one in the scene slot the legs read as a
                  character sitting on nothing, which is honest, because a seat is furniture
                  rather than a pose.
                </p>
                <p>
                  Trademark safety: no controller, keyboard, console, chair or headset here
                  copies a real device silhouette, and nothing carries a mark. The Konsu chassis
                  is deliberately a generic slab rather than any handheld you could name.
                </p>
              </Note>
            </CardContent>
          </Card>
        </section>

        <section id="questions" className="scroll-mt-24 space-y-4">
          <SectionHeader title="Open questions">
            The decisions that are actually waiting on somebody. If you answer one of these,
            something moves.
          </SectionHeader>
          <Card>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <Note title="Which humanoid?">
                <p>
                  Kaveri, Porukka or Stadi — the one that fills the person-shaped hole. Judge it
                  on the combined row at the top of{" "}
                  <a href="#people" className="text-primary underline underline-offset-2">
                    The people
                  </a>
                  , then on whether the family reads as kid / adult / elder without captions.
                </p>
              </Note>
              <Note title="Which Chief Engineer?">
                <p>
                  Five bodies carry the same character under identical conditions in{" "}
                  <a href="#engineer" className="text-primary underline underline-offset-2">
                    The team
                  </a>
                  : the beaver, the Palikka builder, the Kaveri person, the Lohi engine-room
                  dragon and Silmu. Related and separate: is the engine room a scene the product
                  actually wants?
                </p>
              </Note>
              <Note title="Nappi or Kaari?">
                <p>
                  The fold branches, in{" "}
                  <a href="#earlier" className="text-primary underline underline-offset-2">
                    Earlier rounds
                  </a>
                  . If Nappi reads as cute while staying all corners, then Taitto was never cold
                  because of its angles but because it was adult-proportioned — and Kaari
                  conceded a round head it did not need.
                </p>
              </Note>
              <Note title="Does Palikka survive the partner-deck check?">
                <p>
                  We are a Roblox partner. The voxel line is the closest thing in the set to the
                  no-look-alikes line, and it is a business question rather than a taste one. See{" "}
                  <a href="#palikka" className="text-primary underline underline-offset-2">
                    Palikka
                  </a>
                  .
                </p>
              </Note>
              <Note title="Which body is Reksi?">
                <p>
                  The legacy set draws him as a man in sunglasses and as a voxel T-rex, and the
                  two agree about almost nothing. The real question underneath it, in{" "}
                  <a href="#reksi" className="text-primary underline underline-offset-2">
                    The team
                  </a>
                  : what is a viewer recognising, and does the crown belong to him?
                </p>
              </Note>
              <Note title="How big is the shipping set?">
                <p>
                  Today&rsquo;s honest answer is a humanoid family plus the animals plus Silmu,
                  with Palikka as the voxel line if it clears the check above. Every other species
                  here is a candidate for the drawer. The counter-question worth asking: is a
                  cast this size a fleet, or is it a zoo?
                </p>
              </Note>
              <Note title="Do avatars replace identicons?">
                <p>
                  If yes, that is the first thing to ship and it needs a server-stored, server-
                  validated customisation — the same impersonation concern the voice token route
                  already handles. See{" "}
                  <a href="#avatars" className="text-primary underline underline-offset-2">
                    Avatars
                  </a>
                  .
                </p>
              </Note>
              <Note title="Where does the fleet land first?">
                <p>
                  The proposal is the home page hero — one to three animated characters, never a
                  gallery — then the avatar system, then the painter motif for empty states.{" "}
                  <a href="#surfaces" className="text-primary underline underline-offset-2">
                    Designed from the pages
                  </a>{" "}
                  is the argument that the order should come from the surfaces instead.
                </p>
              </Note>
            </CardContent>
          </Card>
        </section>

        <section id="ruled-out" className="scroll-mt-24 space-y-4">
          <SectionHeader title="Ruled out">
            Ideas that were considered and lost, each with the reason on record. Some were
            decided by rasterising both versions and looking at them; some are rulings rather
            than taste. They are here so the same ground is not covered twice, and so that a
            reader who would have suggested one of them can see what happened to it — if a reason
            below looks wrong, that is worth saying.
          </SectionHeader>
          <Card>
            <CardContent className="p-6">
              <ul className="space-y-4">
                <RuledOut
                  idea="The three-eyed alien"
                  because="Best of the three at 200 pixels and the worst everywhere else. A third white only fits if each eye drops to about two thirds of the paired radius, and by the 40-pixel bust the three have merged into one pale bar with a smear in it. Every avatar use is a bust between 28 and 64, so that band decides it."
                  evidence="More of the cast — Galaksi, “One eye, two or three”"
                  href="#galaksi"
                />
                <RuledOut
                  idea="A one-eyed Galaksi"
                  because="The cyclops crop at 28 pixels is genuinely the strongest of the three. It loses anyway: this directory already has a one-eyed rounded critter in Silmu, and the cyclops face carries no brow at all by design — so adopting it costs the species two of its four mood dials to arrive somewhere we have already been."
                  evidence="More of the cast — Galaksi, “One eye, two or three”"
                  href="#galaksi"
                />
                <RuledOut
                  idea="Goggles on Silmu"
                  because="A pair of lenses on a one-eyed creature recreates the single most identifying feature of the trademarked Minions. This is a ruling rather than a styling call — the goggles accessory is excluded for Silmu and for any one-eyed species. The Chief Engineer wears a hardhat for the same reason, and because a hardhat is what a builder feels like."
                  evidence="The team — the look row above the candidates"
                  href="#engineer"
                />
                <RuledOut
                  idea="The owl as two pale circles under pointed ears"
                  because="It read as a cat at 150 pixels, and on inspection that is exactly what it was drawing: a round head with pointed ears and two eyes in the middle. What makes an owl an owl in flat illustration is the single facial disc — a heart of pale feathers with a hard edge, dipping to a V above the beak — so the rim is the landmark rather than decoration, and the tufts could go."
                  evidence="in the Otso concept file's owl head comment; visible in the animal lineup"
                  href="#animals"
                />
                <RuledOut
                  idea="Ink outlines on the Kylä and Stadi bodies"
                  because="At 420 pixels an outlined bust genuinely reads more like a drawing. It loses on this page for two reasons that only show up on a dark ground: a near-black line on a near-black page fades the silhouette's outer edge instead of drawing it, and the shared limb renderer has no stroke — so an outlined head arrives attached to unoutlined sleeves, and that seam is the first thing the eye finds. A partial outline is worse than none. At 40 pixels all three versions are the same picture."
                  evidence="The animals — Kylä, “The contour question”"
                  href="#kyla"
                />
                <RuledOut
                  idea="Lohi hovering at rest"
                  because="Drawn both ways and rasterised. Lifted, the soles hang a visible gap above their own shadow and nothing on the body explains why — the wings are two lobes the size of its own head and a child can see they are not doing it. Grounded, it is a small heavy animal standing next to you, which is also the funnier of the two. Only a species that can fly and means to hovers."
                  evidence="More of the cast — Lohi, and the concept file's “Grounded, not hovering”"
                  href="#lohi"
                />
                <RuledOut
                  idea="The bare-S chest crest"
                  because="Two versions were drawn and rasterised on six species: the letter straight onto the body, and the letter on a badge field. The bare S is the better-looking of the two on a person in a contrasting top and fails outright everywhere else — an amber S on a honey bear or an olive voxel dinosaur is a mark you have to hunt for, because a garment accent is chosen to sit against a garment and half this fleet is wearing its own skin."
                  evidence="Jalo — “The crest, on five species”"
                  href="#jalo"
                />
                <RuledOut
                  idea="Kide at avatar sizes"
                  because="The slender crystal is the most distinctive silhouette in the fold family and the first to disappear: thin limbs are what a small raster loses first, and by 40 pixels it is a smudge. Kept in the drawer for anything competitive, where it is drawn large."
                  evidence="Deep dives — Kide, the scale ladder and avatar crop"
                  href="#deep-kide"
                />
                <RuledOut
                  idea="The round-one Ytymo"
                  because="It read as an egg — muna — and no amount of tinting fixes an ovoid. The rebuild broke the top line into two licks off a central notch, which is a change to the shape rather than to the colour, because the colour was never the problem."
                  evidence="Deep dives — Ytymo"
                  href="#deep-ytymo"
                />
                <RuledOut
                  idea="The pink lynx"
                  because="The legacy “taply” is a very tall pink leopard, and the first mapping made it a lynx in a berry coat on the reasoning that the lynx is the nearest Finnish cousin. Both were rasterised beside the original and the leopard won on sight: the rosettes and the long curled tail are what anyone actually looks at, and the lynx has a stub tail and ear tufts that pull it somewhere else entirely."
                  evidence="The animals — the legacy cast strip, taply"
                  href="#legacy-cast"
                />
                <RuledOut
                  idea="Metsä's inverted-ink register as the species"
                  because="A pale nib straight onto the night is the best of the three registers at 200 pixels. It is kept as one colourway rather than as the species, because the register that ships has to survive being small and being put on a card, and the wash-plus-dark-nib version is the one that does both."
                  evidence="The animals — Metsänväki, “The colour decision”"
                  href="#metsa"
                />
                <RuledOut
                  idea="Refusing the voxel animals for looking like Minecraft"
                  because="Overturned. The no-look-alikes rule forbids rebuilding a character that already exists in somebody else's game — no creepers, no cows, no Steve proportions — and says nothing about blocks. A hippo and a T-rex are nobody's mob. The refusal cost us two legacy characters on a technicality; they are now a voxel species of our own, still owing the partner-deck check."
                  evidence="Legacy — “What did not, and why”"
                  href="#legacy"
                />
                <RuledOut
                  idea="“Finnish fauna only”"
                  because="Never a rule — a description of the first seven animals that hardened into one, and it cost us the unicorn, the giraffe and the raccoon. School of Gaming is proud to be Finnish and highlights Finnish nature where it can, and is also a global company that loves every animal including the invented ones."
                  evidence="Legacy — “What did not, and why”"
                  href="#legacy"
                />
                <RuledOut
                  idea="The first two face rounds"
                  because="Both read as creepy and soulless. Round one had the symbol grammar and only obeyed it for half the set; round two removed the white eye — the half that was working — and kept the highlight, which was the actual realism cue. Round three deletes every realism cue instead. Rather than restate them, they are rendered live beside the current one."
                  evidence="The face — all three rounds, newest first"
                  href="#faces"
                />
                <RuledOut
                  idea="A mascot on the 404 page"
                  because="Deliberately not in the surfaces survey. The method there is to name the job a page is already asking somebody to do and then draw whoever does it — which disqualifies any idea that could have been had without opening the app, and a mascot on a 404 is the example every product ever built has already had."
                  evidence="Designed from the pages — the rule the five were picked by"
                  href="#surfaces"
                />
                <RuledOut
                  idea="A character beside the staff-only session note, and in the admin certification queue"
                  because="Two deliberate negatives from the same survey. The report card is warm where a family reads it and carries nothing two inches below where the same surface turns staff-only, because that boundary is the entire design of the page. The queue where a gedu is judged gets no character at all — a decision made out loud rather than an omission."
                  evidence="Designed from the pages — the report and certification cards"
                  href="#surfaces"
                />
                <RuledOut
                  idea="A pixel-art sprite fleet"
                  because="Perfect at icon size and genuinely gamer-native, and never built: it cannot scale up for a hero, and every new pose is hand-placed pixels — the opposite of maintainable in code, which is the whole premise of doing this in components."
                  evidence="considered at the outset; not built"
                />
                <RuledOut
                  idea="A mask or helmet species, where the wearer is never shown"
                  because="An elegant answer to the no-photographs problem — the costume is the character and there is no face to get wrong. It reads as anonymous rather than as friendly, which is the opposite of what a page with a person-shaped hole in it needs."
                  evidence="considered at the outset; not built"
                />
                <RuledOut
                  idea="A single mascot with no fleet"
                  because="Not ruled out so much as still live, and it belongs here because it is the alternative every section above is quietly assuming away. Worth taking seriously if the cast turns out to be more than the site can carry."
                  evidence="see the shipping-set question above"
                  href="#questions"
                />
              </ul>
            </CardContent>
          </Card>
        </section>

        <ViewportSection id="earlier" estimatedHeight={SECTION_HEIGHTS["earlier"]}>
          <SectionHeader title="Earlier rounds">
            Two studies that were the argument once and are not any more. The arm rebuild is
            settled — a limb is two tapered segments and a derived joint, and every character on
            this page already inherits it — and the fold branches are still holding one open
            question. Neither needs to be read to have an opinion about the fleet, which is why
            they are down here and closed.
          </SectionHeader>
          {/* The `id` sits outside the collapsible on purpose. These two start
              closed, so an anchor placed on their contents would not exist in
              the document until somebody opened it — and a shared link to a
              section that has to be opened first before the link works is a
              broken link. Landing on the closed header is the correct
              behaviour: the reader arrives at the thing they were sent to and
              decides whether to open it. */}
          <div id="arms" className="scroll-mt-24">
            <Collapsible title="Arms — a joint instead of a bow" subtitle="Round two, settled">
              <div className="p-4">
                <ArmStudy />
              </div>
            </Collapsible>
          </div>
          <div id="taitto" className="scroll-mt-24">
            <Collapsible
              title="Taitto, and three ways to branch off it"
              subtitle="Nappi vs Kaari is still open"
            >
              <div className="p-4">
                <TaittoBranches />
              </div>
            </Collapsible>
          </div>
        </ViewportSection>

        <section id="deep" className="scroll-mt-24 space-y-3">
          <SectionHeader title="Deep dive, one concept at a time">
            Everything about a single species, for whichever ones you want to go further on:
            builds, colourways, the full pose sheet, the six expressions, the three roles,
            dress-up, the scale ladder, the silhouette test, the avatar crops and the named
            fleet. They open expanded, which makes this page very long — a collapsed section is
            one a reader skips and never learns was there, and being skipped is the worse
            failure. Close the ones you do not want, or jump straight to one from the list.
          </SectionHeader>
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                {CONCEPTS.length} concepts
              </h3>
              <div className="flex flex-wrap gap-2">
                {CONCEPTS.map((def) => (
                  <a
                    key={def.id}
                    href={`#deep-${def.id}`}
                    className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {def.species}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
          {CONCEPTS.map((def) => (
            <ViewportSection
              key={def.id}
              id={`deep-${def.id}`}
              estimatedHeight={DEEP_DIVE_HEIGHT}
              className="scroll-mt-24"
            >
              <Collapsible title={def.species} subtitle={def.kind} defaultOpen>
                <ConceptSection conceptId={def.id} />
              </Collapsible>
            </ViewportSection>
          ))}
        </section>
      </div>
    </div>
  );
}

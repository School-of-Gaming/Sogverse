/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is either a caption on a page no user will ever see, or a verbatim quotation of a real product string being mocked, and the whole file gets deleted with the exploration */
"use client";

/**
 * Design from function — five characters that came out of real pages.
 *
 * Every other section on this page argues about a base model in the abstract:
 * here are ten species, which one do you like. This one runs the argument the
 * other way round. Four agents walked the App Router tree, the email templates,
 * the voice rooms and the session feeds, asked of each surface *who sees this
 * and what did they come here to do*, and wrote the answers down; the full
 * survey is the deliverable that goes with this section. What follows is the
 * five surfaces where the answer produced a character rather than a decoration.
 *
 * ## The rule the five were picked by
 *
 * **Name the job the page is already asking someone to do, then draw whoever
 * does it.** That is the whole method, and it is a real constraint rather than
 * a framing: it disqualifies the ideas that could have been thought of without
 * opening the app. A mascot on a 404 is the obvious example — every product
 * ever built has one, the page needs no reading to suggest it, and it is
 * therefore *not* here. What is here is the gedu who is walking toward a family
 * because the copy on that card promises a named human and draws a magnifying
 * glass; the person standing outside a door because an uncertified account
 * renders as a literally empty `CardContent`; the child with nothing on tonight
 * because that page is deliberately powerless and has nothing to offer but
 * company.
 *
 * ## What each card is
 *
 * A fixture of the surface's own chrome — the real `Card`, the real `Button`,
 * the real type scale and the real strings, quoted from `messages/en.json` — at
 * roughly the width the surface is read at, with the character standing where
 * it would stand. Not a screenshot and not a redesign: the point is to see the
 * drawing against the thing it would have to live next to, on the ground the
 * product actually paints.
 *
 * Two of the five carry a **negative** finding, and those are the ones worth
 * arguing about. The report card shows the owl beside the family-facing report
 * and nothing at all beside the staff-only note two inches below it, because
 * the boundary between those two audiences is the entire design of that
 * surface. The certification card is warm for a person waiting to be let in —
 * and the admin queue where that same person is *judged* gets no character at
 * all, which is a decision this section is making out loud rather than an
 * omission.
 *
 * ## Where the fleet ran out
 *
 * Recorded in each card's caption where it bit, because the gaps are the useful
 * output. In short: no figure can enter from off-frame, no two figures can
 * share one composition, the `door` scene has no shut state, no scene has a
 * night, and there is no prop that reads as a message, a ticket or a
 * celebration. Nothing here invents any of them.
 *
 * Deleted with the rest of the exploration.
 */

import { Check, CreditCard, Lock, ShieldAlert } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Mascot } from "../mascot";
import type { MascotProps } from "../mascot";

/** Who meets the surface. Drives the badge row, nothing else. */
type Audience = "parent" | "gamer" | "gedu" | "admin" | "everyone";

const AUDIENCE_LABELS: Record<Audience, string> = {
  parent: "Parent",
  gamer: "Gamer",
  gedu: "Gedu",
  admin: "Admin",
  everyone: "Everyone",
};

type Idea = {
  /** The route or component the fixture is a copy of. */
  where: string;
  /** The job, named before the character — the method, stated per card. */
  job: string;
  audiences: readonly Audience[];
  /** What fills the person-shaped hole on that surface right now. */
  today: string;
  /** Line one of the caption: who sees it. */
  who: string;
  /** Line two: what the character is doing there. */
  doing: string;
  /** What this idea wanted and could not have. Empty when the fleet coped. */
  missing?: string;
  fixture: ReactNode;
};

/**
 * The frame every fixture sits in.
 *
 * `bg-background` rather than `bg-card`, because most of these surfaces are
 * cards on the page background and a card drawn on a card loses its own border.
 * The inner box is width-limited to roughly the column the real surface is read
 * at — a family enrollment card is a phone-width card, a confirmation page is a
 * `max-w-2xl` column — so the character is judged at the size it would really
 * be rather than at whatever the grid gives it.
 */
function IdeaCard({ idea }: { idea: Idea }): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="text-sm font-semibold text-foreground">{idea.where}</code>
        <span className="flex flex-wrap gap-1">
          {idea.audiences.map((a) => (
            <Badge key={a} variant="secondary" className="text-[10px]">
              {AUDIENCE_LABELS[a]}
            </Badge>
          ))}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">The job:</strong> {idea.job}
        <span className="block opacity-80">Today: {idea.today}</span>
      </p>
      <div className="rounded-lg border border-dashed border-border/60 bg-background p-4">
        {idea.fixture}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="block text-foreground">{idea.who}</span>
        <span className="block">{idea.doing}</span>
        {idea.missing !== undefined && (
          <span className="mt-1 block text-warning">
            Fleet cannot express: {idea.missing}
          </span>
        )}
      </p>
    </div>
  );
}

/** A character standing in a fixture, never selectable and never in the tab order. */
function Figure({ size = 92, ...props }: MascotProps): ReactElement {
  return <Mascot {...props} size={size} className="shrink-0" />;
}

// ---------------------------------------------------------------------------
// 1. The unplaced seat — "we're matching them with a Gedu"
// ---------------------------------------------------------------------------

/**
 * The family enrollment card in its `awaiting` state, which is what a parent
 * looks at for the day between paying and an admin putting their child in a
 * group.
 *
 * The real card wears `border-info/40 bg-gradient-to-r from-info/5` and states
 * the promise with a 16px `UserRoundSearch` — a magnifying glass over a head —
 * beside a sentence about a named human. The character is that sentence: a gedu
 * with the lanyard and the clipboard the role costume already gives, walking.
 * `gaze="right"` points the eyes at the copy rather than at the reader, which
 * is the difference between a mascot standing near some text and a person on
 * their way to it.
 */
function UnplacedSeatFixture(): ReactElement {
  return (
    <div className="mx-auto max-w-sm">
      <Card className="border-info/40 bg-gradient-to-r from-info/5 to-transparent">
        <CardContent className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Club
          </p>
          <p className="mt-0.5 font-semibold text-foreground">
            Minecraft Builders — Tuesdays
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Figure
              size={72}
              concept="kaveri"
              form="adult-b"
              variant="teal"
              role="gedu"
              pose="walking"
              expression="happy"
              gaze="right"
              label="A gedu walking toward the card, lanyard and clipboard"
            />
            <p className="text-sm leading-snug text-info">
              Signed up — we&rsquo;re matching them with a Gedu and a group before
              the first session.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Awaiting certification
// ---------------------------------------------------------------------------

/**
 * The card an uncertified gedu meets in place of the tools they cannot use.
 *
 * Its `CardContent` is empty in the real component — the literal string
 * `<CardContent />` — inside a section that is `min-h-[calc(100svh-9rem)]`, so
 * a gedu who registered last night and has no groups yet gets a viewport of
 * nothing under one grey shield. That empty content is where the figure goes,
 * and the `door` scene is the reason this idea is buildable at all: the fleet
 * already owns a door with a poster on it, which is exactly the staff-room a
 * person in this state is standing outside of.
 */
function AwaitingCertificationFixture(): ReactElement {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            Awaiting certification
          </CardTitle>
          <CardDescription>
            An admin needs to certify your Gedu account before you can start voice
            rooms or reset Minecraft Education passwords.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-2 pt-1">
          <Figure
            size={132}
            concept="kaveri"
            form="adult-b"
            variant="teal"
            role="gedu"
            outfit={{ scene: "door" }}
            pose="idle"
            expression="thinking"
            gaze="up"
            label="A gedu waiting outside the staff-room door"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. A child's first login, with nothing on
// ---------------------------------------------------------------------------

/**
 * The gamer dashboard's empty state.
 *
 * The card is `border-dashed`, holds one grey sentence, and — correctly — has
 * no call to action at all, because a child cannot book anything. That is what
 * makes it the best surface on the whole survey: it has nothing to offer but
 * company, and company is what a character is for. The figure is not an
 * instruction and not a mascot waving; it is somebody else with nothing on
 * tonight, sitting there quite happily until a grown-up turns up.
 */
function GamerEmptyFixture(): ReactElement {
  return (
    <div className="mx-auto max-w-md">
      <p className="text-center font-display text-lg text-primary">Welcome, Aino!</p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Ready to play and learn?
      </p>
      <Card className="mt-4 border-dashed">
        <CardContent className="flex items-center gap-3 p-5">
          <Figure
            size={104}
            concept="otso"
            form="fox"
            variant="honey"
            pose="controller"
            expression="happy"
            gaze="right"
            label="A fox with a controller, waiting for someone to play with"
          />
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Ask a parent to look at the clubs and camps with you,
            and pick one together.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. The session report, at 20:10 — and the note it must not reach
// ---------------------------------------------------------------------------

/**
 * The gedu's session-record editor, both halves of it.
 *
 * The top block is the write-up every parent in the group will read; the block
 * below it is the staff-only note where an incident goes, and its own docblock
 * and an ESLint rule keep family code away from it. **The character stops at
 * that line.** Showing the two together is the point of the card — a drawing
 * that appears beside a cheerful public report and *also* beside a record of a
 * child being excluded has blurred the only distinction that surface exists to
 * make.
 *
 * The owl is at the desk because the moment is 20:10 and the session ended at
 * 20:00; `desk-setup` is the closest the scene library gets, and it is a
 * daylight desk.
 */
function SessionReportFixture(): ReactElement {
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Session report — visible to parents and gamers
        </p>
        <div className="mt-1.5 flex items-start gap-2">
          <div className="min-h-[92px] flex-1 rounded-md border border-input bg-background p-3 text-xs leading-relaxed text-muted-foreground">
            Start with a Title, then the full picture — the session&rsquo;s topic,
            the group&rsquo;s work, how it goes, and the highlights and moments
            worth remembering.
          </div>
          <Figure
            size={100}
            concept="otso"
            form="owl"
            variant="berry"
            outfit={{ scene: "desk-setup" }}
            pose="seated"
            expression="focused"
            gaze="left"
            label="An owl at a desk beside the report field"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="secondary">
            Send to parents
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3 w-3" />
          Session note — Gedus only
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Anything another Gedu should know — and anything you need on record
          privately: an incident, bullying, a worry about a gamer.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-wider text-warning">
          No character here. Ever.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. "You're all set!"
// ---------------------------------------------------------------------------

/**
 * The page a parent lands on about three seconds after Stripe takes their
 * money, and the happiest moment in the funnel.
 *
 * It currently opens with a 56px `bg-primary/10` circle holding a
 * `CheckCircle2`, and then three white cards — a receipt for a thing that is
 * not really a receipt. The character replaces the glyph rather than sitting
 * beside it, because the tick is doing the job of an illustration badly rather
 * than doing a job of its own; the summary card underneath keeps its real
 * facts, including the 96px product thumbnail the real page uses.
 *
 * The rooster is the herald from the village cast, and this is the surface that
 * argues for that job existing: the card below literally says *we will place
 * your child in a group with a Gedu*, which means someone is carrying that
 * message ahead of the family, and today nobody is drawn doing it.
 */
function ConfirmationFixture(): ReactElement {
  return (
    <div className="mx-auto max-w-md">
      <div className="flex flex-col items-center text-center">
        <Figure
          size={116}
          concept="kyla"
          form="rooster"
          variant="savi"
          pose="wave"
          expression="excited"
          label="The herald, waving, with the news"
        />
        <p className="mt-1 text-xl font-bold tracking-tight text-foreground">
          You&rsquo;re all set!
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Aino is enrolled in Minecraft Builders.
        </p>
      </div>
      <Card className="mt-4">
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your order
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-primary">
              SOG
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Club
              </p>
              <p className="text-sm font-semibold text-foreground">
                Minecraft Builders
              </p>
            </div>
          </div>
          <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Gamer</dt>
              <dd className="font-medium text-foreground">Aino</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Price</dt>
              <dd className="flex items-center gap-1 font-medium text-foreground">
                <CreditCard className="h-3 w-3 text-muted-foreground" />
                39,00 € / month
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-success" />
            We&rsquo;ll place Aino in a group with a Gedu before the first session.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const IDEAS: readonly Idea[] = [
  {
    where: "family enrollment card — unplaced seat",
    job: "be the person who is coming.",
    audiences: ["parent", "gamer"],
    today:
      "a 16px UserRoundSearch — a magnifying glass over a head — beside a sentence promising a named human.",
    who: "A parent who has just paid, in the day between the money landing and an admin placing their child.",
    doing:
      "The gedu the copy promised, walking toward the card with the lanyard and clipboard the role costume already carries, eyes on the sentence rather than on the reader.",
    missing:
      "entry from off-frame. The figure should be arriving at the card's edge; every mascot is one figure centred in its own square, and there is no edge crop.",
    fixture: <UnplacedSeatFixture />,
  },
  {
    where: "/gedu — Tools, uncertified account",
    job: "wait to be let in.",
    audiences: ["gedu"],
    today:
      "a grey ShieldAlert over an empty <CardContent />, in a section a viewport tall.",
    who: "A gedu who registered last night, checking at 07:50 whether they are in yet.",
    doing:
      "Standing outside the staff-room door — the exact mirror of the card above it, one person waiting outside a door and one walking toward a family. The admin queue where this same person is judged gets no character at all.",
    missing:
      "a shut door. The door scene is one flat open door; waiting to be let in wants it closed, with light under it.",
    fixture: <AwaitingCertificationFixture />,
  },
  {
    where: "/gamer — empty dashboard",
    job: "wait with them, because they cannot act.",
    audiences: ["gamer"],
    today:
      "a border-dashed card, one grey sentence, and correctly no call to action — a child cannot book.",
    who: "A child on their first login, being told to go and ask an adult.",
    doing:
      "Not instructing and not selling: somebody else with nothing on tonight, controller already out, happy to sit there until a grown-up turns up.",
    missing:
      "a pair. The copy says pick one together and the strongest version of this is two figures sharing one composition; two mascots side by side are two squares with a gap.",
    fixture: <GamerEmptyFixture />,
  },
  {
    where: "gedu session record — the report, and the note",
    job: "sit up with them while they write.",
    audiences: ["gedu"],
    today: "grey boxes and a Save/Cancel row, on both halves alike.",
    who: "A gedu at 20:10, the session ended at 20:00, the room still in their head.",
    doing:
      "Keeping the desk company beside the family-facing report — and stopping dead at the staff-only note below, because that boundary is the whole design of the surface.",
    missing:
      "night. The moment is 20:10; desk-setup is a daylight desk, and the lantern (the only light source in the prop library) reads as a smudge at this size and lights nothing around it.",
    fixture: <SessionReportFixture />,
  },
  {
    where: "/shop/confirmation — “You’re all set!”",
    job: "run ahead with the news.",
    audiences: ["parent"],
    today:
      "a 56px tinted circle with a CheckCircle2, then three cards. It reads like a receipt.",
    who: "A parent about three seconds after being charged, on the happiest screen in the funnel.",
    doing:
      "Replacing the tick rather than joining it — the herald who gets to the club before the family does, which is the same character the confirmation email wants, carrying something different.",
    missing:
      "something to carry, and something to celebrate with. No prop reads as a message, a ticket or a seat, and no accessory says this went well.",
    fixture: <ConfirmationFixture />,
  },
];

export function SurfaceIdeas(): ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Design from function — five characters that came out of real pages
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Every other section here argues about a base model in the abstract. This
          one reads the app instead: who sees this page, what did they come to do,
          and what is standing in the person-shaped hole today. The method is{" "}
          <strong className="text-foreground">
            name the job the page is already asking someone to do, then draw
            whoever does it
          </strong>{" "}
          — which is why there is no mascot on a 404 below. That idea needs no
          reading. These five do.
        </p>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Each card is the surface&rsquo;s own chrome — the real components, the
          real type, the real strings — with the character where it would stand,
          drawn only from species, scenes and props the fleet already has. Where an
          idea wanted something that does not exist, the caption says so instead of
          building it.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {IDEAS.map((idea) => (
          <IdeaCard key={idea.where} idea={idea} />
        ))}
      </div>
    </div>
  );
}

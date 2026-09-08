/**
 * The world voice's best cases in Sogverse, each drawn twice.
 *
 * **What is being asked.** The team that owns the brand prefers Poppins, and
 * §3 and §5 could be ruled to it one at a time without anybody ever answering
 * the question underneath them: does the world voice have *any* placement in
 * this product? So this section stops asking site by site and asks it once, on
 * the strongest cases the app has. If Poppins wins here it wins everywhere, and
 * Space Mono is the machine face only — a room code, a password, an id, a log —
 * which is the ruling §7 already landed.
 *
 * **How a case earned its place.** Two tests, both the Guidebook's. The reader
 * has to be *inside the platform* — the gamer's own surfaces first, then the
 * voice rooms — and the words have to be **Sogverse speaking as a world**: the
 * platform naming one of its own places or things, or a Level 3 canon term used
 * without gloss. Copy where the brand is explaining itself to a parent is out
 * by construction, however deep in the app it sits.
 *
 * **Why most cases draw a whole row rather than a headline.** The realistic
 * proposal is not a surface in mono; it is one *element* in mono with everything
 * around it in Poppins — the name of the place in the world voice, the furniture
 * and the plain sentences in the app face. A name lifted out of its row cannot
 * be judged on that, because the mix is the thing being judged. So the eyebrow,
 * the schedule line, the description and the pills are all drawn, in Poppins, in
 * both columns, and only the named thing moves between them.
 *
 * **Two columns, not three.** Nothing here is set in Press Start 2P: these are
 * sites that ship in Poppins today and would either move to the world voice or
 * stay where they are.
 *
 * **The six, and why each is a best case.**
 *
 * 1. **The zone list in a voice room** — the strongest case in the product, and
 *    the only one where the platform names a place it invented rather than a
 *    thing somebody sold. "Clubhouse" is a room inside Sogverse that exists
 *    nowhere else, and the four Yty zones are canon terms used with no gloss at
 *    all, which is Level 3 by definition. A gamer standing in a voice room is as
 *    far inside the platform as this product goes. The third row is a
 *    moderator's own zone name, drawn deliberately: it is the same slot filled
 *    by a person rather than by the world, and whether one face can carry both
 *    is part of the question.
 * 2. **The room's own heading** — the same surface one level up, and the test of
 *    whether the world voice survives on furniture. "Voice Room" is what the
 *    platform calls the place, but it is a description of a feature rather than
 *    a name it gave something, and the sentence under it is plain instruction.
 * 3. **A club in the gamer's list** — the child's own dashboard, the row they
 *    meet most often, and the construct that shows the mix best: the type noun
 *    above it and the schedule under it stay in the app face while the name
 *    moves. The name itself is a product a business named, which is what makes
 *    it a real test rather than a favourable one.
 * 4. **The gamer's product page masthead** — the same name at page scale, on the
 *    gamer's own route, where it is the identity of the page rather than one row
 *    in a list. If a name in the world voice works anywhere it works at this
 *    size.
 * 5. **The dashboard's type headings** — "Clubs", "Camps", "Events" are glossary
 *    terms the library owns, on the child's own page, and they are the one piece
 *    of *structure* on a gamer surface rather than a piece of content. A world
 *    voice that reaches the furniture reaches this.
 * 6. **The shop's product title** — the one case drawn from outside the
 *    platform, and it is here because the dial puts store product copy at Level
 *    3 while the face rule keeps the world voice out of the marketing website's
 *    parent-facing copy. The two sentences point opposite ways at exactly this
 *    page, and the drawing is how that gets settled rather than argued.
 *
 * **Considered and left out.**
 *
 * - *The gamer greeting* (§3) and *the call-ended heading* (§5) are already
 *   drawn in §2 and are not drawn twice.
 * - *The session feed's dates, times and month dividers* — machine text by
 *   construction, and already the machine face's business under §7.
 * - *The Yty explainer on `/about`* — the canon terms are all there, but the
 *   page is the brand describing its own architecture to a mixed audience, which
 *   the dial puts at Level 1 and the face rule keeps in Poppins.
 * - *The instant room's lobby, name field and join button* — a person typing
 *   their display name into a form is not the world naming anything, and the
 *   room's code beside it is machine text that is already Space Mono.
 * - *The parent's dashboard and the family product page's parent copies* — the
 *   same components, ruled out by audience alone.
 * - *Chat messages and participant names in a voice room* — inside the platform,
 *   but the words are a child's own, and the world voice is Sogverse speaking,
 *   not its members.
 *
 * **Every class is reproduced from the component**, with only the face class
 * added to the named element. Colours stay — `text-act` on the shop's topic, the
 * zone tiles' hues, the ink edge on the Clubhouse tile — because a face is
 * judged in the ink it will actually wear. Weights stay too: both families draw
 * everything asked for here, so nothing is being hidden.
 */

import type { ReactNode } from "react";
import {
  CalendarClock,
  ChevronRight,
  Heart,
  Home,
  Lock,
  Mic,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Case, Columns, Column, Exemplar, CardGround, Question } from "./parts";

/** The two drawings of one site: the app face today, and the world voice. */
function TwoFaces({ render }: { render: (faceClass: string) => ReactNode }) {
  return (
    <Columns of={2}>
      <Column name="today — Poppins">{render("font-sans")}</Column>
      <Column name="Space Mono">{render("font-mono")}</Column>
    </Columns>
  );
}

/**
 * One zone card from the voice room's list.
 *
 * The tile is the lifted grey with its edge in the zone's own hue and the glyph
 * inked in it — the library's glyph-tile shape — and the classes are the app's:
 * a rounded row with a border, a 9×9 tile, the name filling the rest, and the
 * private pill where a zone is locked. Only `name` takes the face under test.
 */
function ZoneRow({
  face,
  name,
  glyph: Glyph,
  edge,
  ink,
  locked = false,
}: {
  face: string;
  name: string;
  glyph: LucideIcon;
  edge: string;
  ink: string;
  locked?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg border bg-lifted ${edge}`}
        >
          <Glyph className={`h-5 w-5 ${ink}`} aria-hidden />
        </span>
        <span className={`${face} flex-1 truncate text-sm font-medium`}>
          {name}
        </span>
        {locked && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-lifted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Lock className="h-2.5 w-2.5" aria-hidden />
            Private
          </span>
        )}
      </div>
    </div>
  );
}

export function WorldVoiceSection() {
  return (
    <Question n={4} title="The world voice, its best cases">
      <Case title="The zone list in a voice room">
        <Exemplar
          file="src/components/voice/ZoneList.tsx"
          page="Group session, voice room"
        >
          <TwoFaces
            render={(face) => (
              <div className="space-y-2">
                <ZoneRow
                  face={face}
                  name="Clubhouse"
                  glyph={Home}
                  edge="border-foreground"
                  ink="text-foreground"
                />
                <ZoneRow
                  face={face}
                  name="Harmony"
                  glyph={Heart}
                  edge="border-yty-harmony"
                  ink="text-yty-harmony"
                />
                <ZoneRow
                  face={face}
                  name="Pajahuone"
                  glyph={Wrench}
                  edge="border-pick-1"
                  ink="text-pick-1"
                  locked
                />
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The room's own heading">
        <Exemplar
          file="src/components/voice/VoiceRoom.tsx"
          page="Group session, voice room"
        >
          <TwoFaces
            render={(face) => (
              <div className="space-y-1">
                <h2
                  className={`${face} flex items-center gap-2 text-sm font-medium`}
                >
                  <Mic className="h-4 w-4" aria-hidden />
                  Voice Room
                </h2>
                <p className="text-xs text-muted-foreground">
                  Tap or drag yourself onto a zone to move in. You hear everyone
                  in the same zone.
                </p>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="A club in the gamer's list">
        <Exemplar
          file="src/components/family/EnrollmentCard.tsx"
          page="Gamer dashboard"
        >
          <TwoFaces
            render={(face) => (
              <CardGround>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Club
                      </p>
                      <p
                        className={`${face} text-lg font-semibold leading-tight`}
                      >
                        Minecraft-maanantaikerho
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <ChevronRight
                        aria-hidden
                        className="h-5 w-5 text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block tabular-nums">
                        Mondays 17:00–18:30
                      </span>
                    </span>
                  </div>
                </div>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The gamer's product page masthead">
        <Exemplar
          file="src/components/family/product-page/FamilyProductPageBody.tsx"
          page="Gamer club page"
        >
          <TwoFaces
            render={(face) => (
              <header className="border-b border-border pb-5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Club
                </span>
                <h1
                  className={`${face} mt-1 text-2xl font-bold tracking-tight sm:text-3xl`}
                >
                  Minecraft-maanantaikerho
                </h1>
              </header>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The dashboard's type headings">
        <Exemplar
          file="src/components/gamer/gamer-dashboard-page-body.tsx"
          page="Gamer dashboard"
        >
          <TwoFaces
            render={(face) => (
              <div className="space-y-6">
                <h2 className={`${face} text-3xl font-bold`}>Clubs</h2>
                <h2 className={`${face} text-3xl font-bold`}>Camps</h2>
                <h2 className={`${face} text-3xl font-bold`}>Events</h2>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The shop's product title">
        <Exemplar
          file="src/components/public/products/product-detail-page-body.tsx"
          page="Shop, one product"
        >
          <TwoFaces
            render={(face) => (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span>
                    Camp
                    <span className="normal-case text-act before:mx-1.5 before:text-muted-foreground before:content-['·']">
                      Roblox
                    </span>
                  </span>
                </p>
                <h1
                  className={`${face} mt-1 text-2xl font-bold tracking-tight sm:text-3xl`}
                >
                  Roblox-kesäleiri Oulu
                </h1>
              </div>
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}

/**
 * The five sites Press Start 2P is spent on, each drawn three times.
 *
 * **What is being asked.** Press Start 2P is retired: it is an approved
 * exception outside the library's four faces, and a face the library does not
 * name is not available to the UI. So every site below is re-set in a library
 * face, and the only open question per site is *which* — the app face, or the
 * world voice where the platform is naming one of its own places. The three
 * columns are today, Poppins and Space Mono, in that order, so the site is read
 * left to right from what ships to the two candidates.
 *
 * **Every class is reproduced from the component, minus the face.** The class
 * strings below are the app's own, with `font-display` lifted out and the
 * column's face put in its place — that is the whole of the difference between
 * the three drawings, which is what makes them comparable. Where a site draws in
 * a colour (`text-act` on the gamer greeting and the admin title, the `act` beat
 * inside a hero headline) the colour stays, because a face is judged in the ink
 * it will actually wear.
 *
 * **The weights are not reproduced, and that is deliberate.** Four of these five
 * sites ask for a weight Press Start 2P does not have — `font-bold` on three
 * heroes, `font-semibold` on the admin title, against a family loaded at 400 and
 * only 400 — so what ships today is a browser-synthesised smear rather than a
 * drawn weight. The today column therefore drops the weight class and draws the
 * face at the one weight it owns, which is the honest picture of the glyphs; the
 * Poppins and Space Mono columns keep the app's weight, because both families
 * load it. Weight is the Heading adoption's question, not this one, and the
 * finding is recorded in `RULINGS.md`.
 *
 * **The copy is the real English message**, so line breaks land where the
 * translator put them and a headline is judged at its real measure. The gamer
 * greeting carries a Finnish name, which is the longest thing that can land in
 * that line and the one part of it no translator controls.
 */

import type { ReactNode } from "react";

import { pressStart2P } from "./press-start";
import { Case, Columns, Column, Exemplar, CardGround, Question } from "./parts";

/**
 * The three drawings of one site.
 *
 * `today` takes the locally-loaded Press Start className rather than a utility,
 * because the demo's theme names four faces and this is not one of them. The
 * other two are the library's own utilities, which is the point: after this
 * adoption every site below is set by a token the library owns.
 */
function ThreeFaces({
  render,
}: {
  render: (faceClass: string) => ReactNode;
}) {
  return (
    <Columns of={3}>
      <Column name="today — Press Start 2P">{render(pressStart2P.className)}</Column>
      <Column name="Poppins">{render("font-sans")}</Column>
      <Column name="Space Mono">{render("font-mono")}</Column>
    </Columns>
  );
}

/** The home hero's headline, `<act>` on the payoff beat, as the message authors it. */
function HomeHeroTitle() {
  return (
    <>
      Where
      <br />
      Screen Time
      <br />
      Becomes
      <br />
      <span className="text-act">Quality Time</span>
    </>
  );
}

export function PressStartSection() {
  return (
    <Question n={2} title="The five Press Start 2P sites">
      <Case title="The home hero">
        <Exemplar file="src/app/(public)/page.tsx" page="Home">
          <ThreeFaces
            render={(face) => (
              <div className="inline-block text-center">
                <h1 className={`${face} text-2xl tracking-tight md:text-6xl`}>
                  <HomeHeroTitle />
                </h1>
                <span className="mt-6 block h-1.5 w-full rounded-full bg-world sm:mt-8" />
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The Roblox hero">
        <Exemplar file="src/components/roblox/roblox-hero.tsx" page="Roblox">
          <ThreeFaces
            render={(face) => (
              <div className="inline-block">
                <h1
                  className={`${face} leading-snug text-2xl sm:text-4xl lg:text-5xl xl:text-6xl`}
                >
                  Build It
                  <br />
                  Play It
                  <br />
                  <span className="text-act">Own It</span>
                </h1>
                <span className="mt-6 block h-1.5 w-full rounded-full bg-world sm:mt-8" />
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The gamer greeting">
        <Exemplar
          file="src/components/gamer/gamer-dashboard-page-body.tsx"
          page="Gamer dashboard"
        >
          <ThreeFaces
            render={(face) => (
              <div className="text-center">
                <h2
                  className={`${face} text-xl text-act break-words md:text-3xl`}
                >
                  Welcome, Väinämöinen!
                </h2>
                <p className="text-muted-foreground">
                  Everything you are signed up for, in one place.
                </p>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The admin all-clear title">
        <Exemplar
          file="src/components/admin/dashboard/needs-attention-panel.tsx"
          page="Admin dashboard"
        >
          <ThreeFaces
            render={(face) => (
              <CardGround>
                <div className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <h3
                    className={`${face} text-sm leading-relaxed tracking-normal text-act sm:text-base`}
                  >
                    All clear
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Nothing needs attention this morning.
                  </p>
                </div>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The call-ended heading">
        <Exemplar
          file="src/components/voice/instant/CallEndedScreen.tsx"
          page="Instant room, after the call"
        >
          <ThreeFaces
            render={(face) => (
              <CardGround>
                <div className="space-y-4 text-center">
                  <h1 className="text-2xl font-semibold">You have left the room</h1>
                  <p className="text-sm text-muted-foreground">
                    You can rejoin any time while the room is open.
                  </p>
                  <h2
                    className={`${face} pt-6 text-2xl leading-tight tracking-tight md:text-3xl`}
                  >
                    <HomeHeroTitle />
                  </h2>
                </div>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}

/**
 * The nine machine-text sites, each drawn twice.
 *
 * **What is being asked.** These nine spend `font-mono`, which the library does
 * not name: Tailwind's own token is left at the UA stack on purpose, so a room
 * code, an id or a password is set in whatever monospace the reader's OS ships
 * and never silently becomes branded. The proposal is to close that: the library
 * owns `--font-mono` and points it at Space Mono, `--font-brand-mono` retires
 * into it, and there is one monospace on the site. Every site below is therefore
 * drawn today (the UA stack) beside Space Mono, and the ruling is one ruling for
 * all nine — a per-site answer would be the thing this question exists to
 * prevent.
 *
 * **Two of the nine are prose in a box, not a value.** The admin testing page's
 * two `<pre>` blocks carry a rendered email's plain-text part, which is a wall of
 * soft-wrapped sentences rather than a code to read one glyph at a time, and it
 * is the one place on this page where a typewriter face has to survive a
 * paragraph. They are drawn at the size the page sets them, which is `text-xs`.
 *
 * **The Klingon easter egg is the odd one.** It is artwork — a red-on-dark
 * console pastiche in the About page — and its monospace is part of the
 * picture rather than a machine-text token. It carries its own colour under the
 * artwork exemption, and the face question is whether the pastiche survives a
 * branded mono. Drawn in its own ink, because a face in the wrong ink is not the
 * thing that ships.
 *
 * **The weights are reproduced here**, unlike the Press Start section: the UA
 * stack synthesises whatever it is asked for, and Space Mono loads 400 and 700.
 * Three of these sites ask for 500 or 600, which neither family draws and both
 * therefore synthesise — a finding for the Heading adoption, recorded in
 * `RULINGS.md`, and not something to hide by drawing a weight the app does not
 * ask for.
 */

import type { ReactNode } from "react";

import { Case, Columns, Column, Exemplar, CardGround, Question } from "./parts";

/**
 * The machine-authored values these sites carry, written to put the ambiguous
 * glyphs where a reader meets them: `1`, `l`, `I`, `0` and `O` all appear in the
 * id, the code and the password, because a monospace that cannot tell them apart
 * fails here and nowhere else.
 */
const CUSTOMER_ID = "cus_QeR7d1LlO0Ik";
const UTM_VALUE = "spring-clubs-2026_oulu-parents_lookalike-1lI0O";
const ROOM_CODE = "KX7-Q0O-1IL";
const ROOM_URL = "sog.gg/room/KX7-Q0O-1IL";
const PASSWORD = "Wolf1lI-Q0Oz";

const EMAIL_TEXT = `School of Gaming – Sogverse

Hi Aino,

Your child's club starts on Monday 14 September at 17:00 (Europe/Helsinki).
Join from the link below, or open the dashboard and press Join.

  https://sog.gg/room/KX7-Q0O-1IL

If the time no longer suits you, you can move to another group from the
club page. Reply to this message and a Gedu will help.

— School of Gaming Galactic Oy, Isokatu 56, 90100 Oulu`;

function TwoFaces({ render }: { render: (faceClass: string) => ReactNode }) {
  return (
    <Columns of={2}>
      <Column name="today — the UA monospace">{render("font-mono")}</Column>
      <Column name="Space Mono">{render("font-brand-mono")}</Column>
    </Columns>
  );
}

export function MonoSection() {
  return (
    <Question n={3} title="The nine machine-text sites">
      <Case title="The rendered email, in the testing page">
        <Exemplar
          file="src/app/(dashboard)/admin/testing/page.tsx"
          page="Admin · Testing (both pre blocks)"
        >
          <TwoFaces
            render={(face) => (
              <div className="rounded-md border border-border">
                <p className="px-3 py-2 text-sm">Attachment: session-invite.txt</p>
                <pre
                  className={`${face} h-64 overflow-auto border-t border-border p-3 text-xs whitespace-pre-wrap`}
                >
                  {EMAIL_TEXT}
                </pre>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The Klingon easter egg">
        <Exemplar file="src/components/about/about-section.tsx" page="About">
          <TwoFaces
            render={(face) => (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">
                      English
                    </th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">
                      tlhIngan Hol
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Literal meaning
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 text-foreground">Gedu</td>
                    <td className={`${face} py-2 pr-4`} style={{ color: "#d00" }}>
                      QeDpIn
                    </td>
                    <td className="py-2 italic text-muted-foreground">
                      science master
                    </td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-2 pr-4 text-foreground">Club</td>
                    <td className={`${face} py-2 pr-4`} style={{ color: "#d00" }}>
                      ghom&apos;a&apos;
                    </td>
                    <td className="py-2 italic text-muted-foreground">
                      great gathering
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The UTM value chip">
        <Exemplar
          file="src/components/admin/user-marketing-card.tsx"
          page="Admin · a user"
        >
          <TwoFaces
            render={(face) => (
              <CardGround>
                <dl className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <dt className="text-muted-foreground">Campaign</dt>
                    <dd
                      className={`${face} break-all rounded-md border border-border bg-lifted px-2 py-0.5 font-semibold`}
                    >
                      {UTM_VALUE}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <dt className="text-muted-foreground">Stripe customer</dt>
                    <dd
                      className={`${face} break-all rounded-md border border-border bg-lifted px-2 py-0.5 font-semibold`}
                    >
                      {CUSTOMER_ID}
                    </dd>
                  </div>
                </dl>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The Minecraft password tool">
        <Exemplar
          file="src/components/tools/minecraft-password-reset-card-view.tsx"
          page="Admin · Tools (the input and the password chip)"
        >
          <TwoFaces
            render={(face) => (
              <CardGround>
                <div className="space-y-4">
                  <textarea
                    readOnly
                    rows={3}
                    aria-label="Usernames"
                    className={`${face} w-full rounded-md border border-border bg-background px-3 py-2 text-sm`}
                    value={"aino.virtanen@sog.gg\nmikael.korhonen@sog.gg"}
                  />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      aino.virtanen@sog.gg
                    </span>
                    <span
                      className={`${face} flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm`}
                    >
                      {PASSWORD}
                    </span>
                  </div>
                </div>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The room code and the room link">
        <Exemplar
          file="src/components/voice/instant/RoomLinkChip.tsx"
          page="Instant room (the in-call chip and the share button)"
        >
          <TwoFaces
            render={(face) => (
              <div className="space-y-4">
                <span className="flex w-fit shrink-0 items-center gap-2 rounded-md border border-border bg-lifted px-3 py-1.5 text-sm">
                  <span className="font-medium text-muted-foreground">
                    Room code
                  </span>
                  <span className={`${face} font-semibold tracking-wider`}>
                    {ROOM_CODE}
                  </span>
                </span>
                <span
                  className={`${face} flex w-full max-w-md items-center justify-center gap-3 rounded-lg border border-border bg-lifted px-5 py-4 text-base font-medium`}
                >
                  <span className="truncate">{ROOM_URL}</span>
                </span>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="The room that is not there">
        <Exemplar
          file="src/components/voice/instant/RoomNotFoundScreen.tsx"
          page="Instant room, bad code"
        >
          <TwoFaces
            render={(face) => (
              <CardGround>
                <div className="space-y-6 text-center">
                  <h1 className="text-2xl font-semibold">
                    That room is not open
                  </h1>
                  <div
                    className={`${face} break-all rounded-md border border-border bg-lifted px-4 py-3 text-2xl font-bold tracking-[0.3em]`}
                  >
                    {ROOM_CODE}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Check the code and try again.
                  </p>
                </div>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}

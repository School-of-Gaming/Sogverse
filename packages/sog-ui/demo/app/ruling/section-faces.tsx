/**
 * Question 8 — the faces.
 *
 * Press Start 2P is dropped, and this section is about what each of its six
 * placements becomes. The pixel face is loaded here and nowhere else in the
 * demo: it is a temporary import behind a temporary page, so the "today" column
 * can be a real rendering rather than a description of one.
 *
 * Each site is drawn three ways where a third makes sense: as it is today, in
 * Poppins at the library step proposed for it, and — for the one line on the
 * list where the platform names its own place — in Space Mono, which is the
 * library's world voice and the only face that construct is for.
 *
 * The `font-mono` sites are listed at the end and are not part of the ruling.
 * The library keeps `--font-mono` as Tailwind's own utility for machine text
 * precisely so a room code cannot silently become branded, and every site in
 * that list is machine text.
 */

import { Press_Start_2P } from "next/font/google";
import { BRAND } from "../../../src/tokens/brand";
import { over } from "./colour";
import { FACE_SITES, MONO_SITES } from "./inventory";
import {
  CARD,
  Caps,
  Case,
  Compare,
  EDGE,
  GROUND,
  INK,
  MUTED_INK,
  Note,
  Panel,
  Question,
  Ratio,
} from "./parts";

/**
 * The face being retired, loaded for the last time.
 *
 * `latin` only, which is what the app loads: the one diacritic any locale puts
 * in this face is Swedish's ä, and it is inside that subset.
 */
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"] });

/** The desktop size each site sets today, in CSS pixels. */
const TODAY_PX: Record<string, number> = {
  "Home hero, h1": 60,
  "Gamer dashboard greeting, h2": 30,
  "Roblox hero, h1": 60,
  "Call ended screen, h2": 30,
  "Admin all-clear, card title": 16,
  "Admin all-clear, the line beside it": 14,
};

/** The lines the app tints, and which of the two brand colours each takes. */
const TINT: Record<string, string | undefined> = {
  "Screen Time": BRAND.primary.hex,
  "Quality Time": BRAND.secondary.hex,
  "Play It": BRAND.primary.hex,
  "Own It": BRAND.secondary.hex,
};

function Lines({ copy, tinted }: { copy: string; tinted: boolean }) {
  return (
    <>
      {copy.split("\n").map((line) => (
        <span
          key={line}
          className="block"
          style={tinted ? { color: TINT[line] } : undefined}
        >
          {line}
        </span>
      ))}
    </>
  );
}

/** The all-clear sprite, drawn at three screen pixels per art pixel. */
const TROPHY = [
  ".PPPPPPP.",
  "PPpppppPP",
  "P.ppppp.P",
  "P.ppppp.P",
  ".PPpppPP.",
  "...PPP...",
  "...PPP...",
  "..PPPPP..",
  ".PPPPPPP.",
  ".fffffff.",
];

function Sprite({ ground }: { ground: string }) {
  const shade = over(BRAND.primary.hex, 0.55, ground);
  const cellColour: Record<string, string | undefined> = {
    ".": undefined,
    P: BRAND.primary.hex,
    p: shade,
    f: MUTED_INK,
  };
  return (
    <div className="flex flex-col" aria-hidden>
      {TROPHY.map((row, y) => (
        <div key={`${row}-${String(y)}`} className="flex">
          {[...row].map((glyph, x) => (
            <span
              key={`${String(x)}-${glyph}`}
              className="h-[3px] w-[3px]"
              style={{ backgroundColor: cellColour[glyph] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FacesSection() {
  return (
    <Question
      n={8}
      title="The faces"
      asks="Press Start 2P is dropped. Which library step does each of its placements take, and is there anywhere the world voice should take over instead of the app face?"
    >
      {FACE_SITES.map((site) => {
        const px = TODAY_PX[site.where];
        const tinted = site.copy.includes("\n");
        return (
          <Case key={site.where} title={site.where}>
            <Note>{site.why}</Note>
            <div className="mt-5">
              <Compare columns={site.worldVoice ? 3 : 2}>
                <Panel
                  label={
                    site.worldVoice
                      ? "Today — Poppins, and not a pixel-face site"
                      : "Today — Press Start 2P"
                  }
                  sub={`Set at ${String(px)}px on a wide viewport.`}
                >
                  <div
                    className="rounded-lg border p-5"
                    style={{ borderColor: EDGE, backgroundColor: CARD }}
                  >
                    <p
                      className={site.worldVoice ? "font-sans" : pressStart.className}
                      style={{
                        color: INK,
                        fontSize: px,
                        lineHeight: site.worldVoice ? 1.5 : 1.4,
                      }}
                    >
                      <Lines copy={site.copy} tinted={tinted} />
                    </p>
                  </div>
                </Panel>

                <Panel
                  label={`Proposed — Poppins at ${site.step}`}
                  sub="One step from the library scale, at every width but the hero's own mobile restep."
                >
                  <div
                    className="rounded-lg border p-5"
                    style={{ borderColor: EDGE, backgroundColor: CARD }}
                  >
                    <p className={`font-sans ${site.stepClass}`} style={{ color: INK }}>
                      <Lines copy={site.copy} tinted={tinted} />
                    </p>
                  </div>
                </Panel>

                {site.worldVoice ? (
                  <Panel
                    label="Also in Space Mono"
                    sub="The world voice — spent only where the platform names one of its own places."
                  >
                    <div
                      className="rounded-lg border p-5"
                      style={{ borderColor: EDGE, backgroundColor: CARD }}
                    >
                      <p
                        className={`font-brand-mono ${site.stepClass}`}
                        style={{ color: INK }}
                      >
                        <Lines copy={site.copy} tinted={false} />
                      </p>
                    </div>
                  </Panel>
                ) : null}
              </Compare>
            </div>
          </Case>
        );
      })}

      <Case title="The all-clear sprite, which is not a face">
        <Note>
          `pixel-art.tsx` is on the list of placements, and it sets no face at
          all — it is a nine-by-ten sprite drawn in the page&rsquo;s own tokens,
          and its doc comment justifies itself by pointing at the pixel face
          beside it. Dropping the face therefore does not delete the sprite; it
          deletes the sprite&rsquo;s argument, which is a separate ruling. Drawn
          below in the library&rsquo;s amber, beside the heading that would
          replace the pixel one.
        </Note>
        <div className="mt-5">
          <Compare columns={2}>
            <Panel label="Today" sub="A pixel wordmark, a pixel cup and a check.">
              <div
                className="flex flex-wrap items-center gap-4 rounded-lg border p-5"
                style={{ borderColor: EDGE, backgroundColor: CARD }}
              >
                <span
                  className={pressStart.className}
                  style={{ color: BRAND.primary.hex, fontSize: 16, lineHeight: 1.6 }}
                >
                  All clear
                </span>
                <Sprite ground={CARD} />
              </div>
              <div className="mt-4 space-y-1">
                <Ratio
                  what="amber title on card"
                  foreground={BRAND.primary.hex}
                  background={CARD}
                  use="body"
                />
                <Ratio
                  what="the sprite's 55% shade on card"
                  foreground={over(BRAND.primary.hex, 0.55, CARD)}
                  background={CARD}
                  use="glyph"
                />
              </div>
              <Note>
                The second measurement is the finding: the sprite shades itself
                with the brand at 55% opacity, which is the one alpha step of a
                brand colour still on this surface after the four Yty tints are
                dealt with. Whatever happens to the face, that shade needs a
                neutral or a second authored value.
              </Note>
            </Panel>
            <Panel label="Proposed" sub="The card step in the app face, with the sprite unchanged.">
              <div
                className="flex flex-wrap items-center gap-4 rounded-lg border p-5"
                style={{ borderColor: EDGE, backgroundColor: CARD }}
              >
                <span className="font-sans text-h3" style={{ color: BRAND.primary.hex }}>
                  All clear
                </span>
                <Sprite ground={CARD} />
              </div>
              <Note>
                Every class the card title carries today — the relaxed leading,
                the cancelled tracking, the shrunk size — exists to undo what the
                pixel face does to a heading. At the card step none of them is
                needed and the title is one utility.
              </Note>
            </Panel>
          </Compare>
        </div>
      </Case>

      <Case title="The mono sites, which stay as they are">
        <Note>
          Machine text: a code a child reads aloud, a credential, an id, a raw
          dump. `--font-mono` is Tailwind&rsquo;s own utility and the library
          deliberately does not claim it, so none of these becomes Space Mono.
          One example, drawn so the distinction is visible rather than asserted.
        </Note>
        <div className="mt-5">
          <Compare columns={2}>
            <Panel label="Machine text — stays font-mono" sub="An instant-room join code.">
              <div
                className="flex items-center justify-center rounded-lg border px-5 py-4"
                style={{ borderColor: EDGE, backgroundColor: GROUND }}
              >
                <span
                  className="font-mono text-h3 tracking-[0.3em]"
                  style={{ color: INK }}
                >
                  7KQ2M
                </span>
              </div>
              <div className="mt-4">
                <Caps>The rest of the list</Caps>
                <ul className="mt-2 space-y-1">
                  {MONO_SITES.map((site) => (
                    <li key={site} className="text-body-s" style={{ color: MUTED_INK }}>
                      {site}
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
            <Panel
              label="World voice — Space Mono"
              sub="The same string in the branded face, to show what the ban is protecting against."
            >
              <div
                className="flex items-center justify-center rounded-lg border px-5 py-4"
                style={{ borderColor: EDGE, backgroundColor: GROUND }}
              >
                <span
                  className="font-brand-mono text-h3 tracking-[0.3em]"
                  style={{ color: INK }}
                >
                  7KQ2M
                </span>
              </div>
              <Note>
                A join code is not a place in Sogverse, it is a string a child
                types into a box. Branding it costs the one thing it needs, which
                is that every glyph be unmistakable when read aloud.
              </Note>
            </Panel>
          </Compare>
        </div>
      </Case>
    </Question>
  );
}

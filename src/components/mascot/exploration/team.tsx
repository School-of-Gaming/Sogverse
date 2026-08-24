/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The team: the three characters that stand for real people at School of
 * Gaming rather than for a user role.
 */

import type { ReactElement } from "react";

import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import type { Outfit } from "../outfit";
import { swatchHex, tintHex } from "../palette";
import type { ExpressionId, PoseId, PropId } from "../vocabulary";
import { Panel } from "./controls";


/**
 * One character, at the four sizes she has to survive.
 *
 * She is a special rather than a study, which is why she gets a section of
 * her own: the kit is three new pieces (a straw hat, a watering can, and a
 * book on the ground with a shoot coming out of its pages) and the whole
 * point of them is that they say "gardener" together and none of them says it
 * alone. Beside the full figure are the three avatar sizes, because the kit
 * is exactly the kind of thing that reads at 240 pixels and is gone by 28 —
 * what has to survive down there is the rat.
 *
 * Everything drawn here is read off the fleet entry rather than restated, so
 * this section cannot drift from the character it is showing.
 */
export function GardenerSpotlight(): ReactElement {
  const member = getConcept("otso").fleet.find((m) => m.form === "rat");
  const shared = {
    concept: "otso" as const,
    form: member?.form ?? "fox",
    variant: member?.variantId ?? "honey",
  };
  const outfit = member?.outfit ?? { hat: "straw-hat", extra: "story-sprout" };
  return (
    <Panel
      title="MoodyRat — the Gardener"
      lede="She tends the stories."
    >
      <div className="flex flex-wrap items-end justify-center gap-8 rounded-xl border border-border bg-background p-4">
        <Mascot
          {...shared}
          pose={member?.pose ?? "reading"}
          expression={member?.expression ?? "thinking"}
          prop={member?.prop ?? "watering-can"}
          outfit={outfit}
          size={240}
        />
        <div className="flex items-end gap-4">
          {[64, 40, 28].map((size) => (
            <figure key={size} className="flex flex-col items-center gap-1">
              <Mascot {...shared} outfit={outfit} crop="bust" size={size} animated={false} />
              <figcaption className="font-mono text-[10px] text-muted-foreground">
                {size}px
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Panel>
  );
}



/**
 * Candidates for a character that has never existed, side by side, and above
 * them the question of what he wears.
 *
 * This section is a *question*, not an answer, which is why it is built the
 * way it is. Several species can each carry the same idea - the CTO, the
 * person in the engine room - and none of them is obviously right, so the
 * only useful thing to render is all of them under identical conditions and
 * let the choice be made by looking.
 *
 * "Identical conditions" is doing real work here. Everything that is *not*
 * the character is pinned: the same pose, the same mood, the same size, the
 * same empty ground, the same engineering-gold garment, the same hardhat. A
 * comparison where one candidate is mid-wave and grinning and another is
 * standing still is a comparison of two performances, and whichever one wins
 * will have won for the wrong reason.
 *
 * **The hat is settled and the row above records why.** The first round put
 * goggles on all of them, and goggles are out on both of the grounds a design
 * decision can be made on: Kyle's read is that a hardhat is what a builder
 * feels like, and a pair of lenses is also the one accessory this directory
 * is not allowed to put on the one-eyed species at all. The look row keeps
 * the two live alternatives beside the answer - the company's own beanie,
 * which says School of Gaming but not *engineer*, and no hat at all, which
 * leaves the whole job to a belt below the neck - because a decision with
 * nothing next to it is an assertion.
 *
 * What each candidate *is* comes from its own fleet entry, looked up by name
 * rather than restated here, so a change to the character lands in this
 * section without anybody remembering to update it. The fallbacks exist for
 * one narrow case - a species whose entry has not been written yet - and are
 * deliberately the same kit, so a missing entry degrades to a placeholder
 * that still compares fairly rather than to a hole in the row.
 *
 * The avatar crops under each are not decoration. Nearly every use of a
 * character in this product is a portrait at 64px or less, and a hat is
 * exactly the kind of thing that reads beautifully at 240 and is three grey
 * pixels at 28. A candidate that cannot survive that row cannot have the job.
 */

const ENGINEER_NAME = "Chief Engineer Kyle";
const ENGINEER_POSE: PoseId = "idle";
const ENGINEER_MOOD: ExpressionId = "focused";

type EngineerIdea = {
  id: ConceptId;
  /** What this candidate is proposing, in one line. */
  caption: string;
  /** Used only until that species' fleet entry exists. */
  fallback: {
    form?: string;
    variantId: string;
    outfit: Outfit;
    prop: PropId;
    garment: string;
  };
};

const ENGINEER_IDEAS: readonly EngineerIdea[] = [
  {
    id: "otso",
    caption:
      "The beaver — the one animal whose whole reputation is that it builds the thing it lives in.",
    fallback: {
      form: "beaver",
      variantId: "honey",
      outfit: { hat: "hardhat" },
      prop: "wrench",
      garment: "amber",
    },
  },
  {
    id: "palikka",
    caption:
      "The voxel builder — a body made of the same blocks as the thing he is fixing. The flattest head in the set, and a hardhat is a dome on a slab rather than a dome on a ball.",
    fallback: {
      form: "hippo",
      variantId: "sammal",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      prop: "wrench",
      garment: "amber",
    },
  },
  {
    id: "kaveri",
    caption:
      "The person — a colleague you can stand next to a gedu and a gamer in the same diagram.",
    fallback: {
      form: "adult-b",
      variantId: "teal",
      outfit: { hat: "hardhat", torso: "hoodie" },
      prop: "blueprint",
      garment: "amber",
    },
  },
  {
    id: "lohi",
    caption:
      "The engine-room dragon — the one candidate whose species is allowed to be about fire, because down there fire is the job rather than the threat.",
    fallback: {
      form: "grown",
      variantId: "virta",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      prop: "wrench",
      garment: "amber",
    },
  },
  {
    id: "silmu",
    caption:
      "The legacy mascot — one eye, one hat, one tool: the oldest shape School of Gaming owns. Also the one that may never wear the goggles this idea started with.",
    fallback: {
      variantId: "musta",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      prop: "wrench",
      garment: "amber",
    },
  },
];

/**
 * Everything about a candidate except how it is posed and how big it is.
 *
 * The `scene` slot is deliberately dropped. One of these fleet entries stands
 * in the engine room, which is the right way for that character to arrive on
 * its own page and the wrong way for it to arrive in a row of three: a
 * candidate with a whole room behind it and two candidates on bare ground is
 * not a comparison of three characters. The room gets its own card below,
 * where it is the thing being looked at.
 */
function engineerLook(idea: EngineerIdea): {
  concept: ConceptId;
  variant: string;
  form?: string;
  outfit: Outfit;
  prop: PropId;
  colors: { clothing: string; clothingAccent: string };
} {
  const member = getConcept(idea.id).fleet.find((m) => m.name === ENGINEER_NAME);
  const form = member?.form ?? idea.fallback.form;
  const garment = swatchHex(member?.garment ?? idea.fallback.garment);
  const { scene: _room, ...worn } = member?.outfit ?? idea.fallback.outfit;
  return {
    concept: idea.id,
    variant: member?.variantId ?? idea.fallback.variantId,
    ...(form === undefined ? {} : { form }),
    outfit: worn,
    prop: member?.prop ?? idea.fallback.prop,
    colors: { clothing: garment, clothingAccent: tintHex(garment, 0.84) },
  };
}

const AVATAR_SIZES = [64, 40, 28];

/**
 * The look row: one body, three heads.
 *
 * The beaver carries it because it is the candidate the idea started on, and
 * because the whole point of the row is that the *body* is held still. Same
 * coat, same pose, same mood, same spanner, same belt, same empty ground —
 * only the hat changes, so anything a viewer notices is the hat.
 *
 * The belt is on all three deliberately, including the bare-headed one. The
 * question the row asks is what the head has to do, and a bare head next to
 * two dressed ones with nothing below the neck either is not "no hat", it is
 * "no costume" — a different and much easier question to answer.
 */
const ENGINEER_LOOKS: readonly { id: string; label: string; hat?: string; note: string }[] = [
  {
    id: "hardhat",
    label: "Hardhat",
    hat: "hardhat",
    note: "The answer. A dome, a lip and a ridge — the only silhouette here that says builder before you have read the caption, and the one thing on him that survives being 28 pixels tall.",
  },
  {
    id: "cap",
    label: "SOG beanie",
    hat: "cap",
    note: "The company's own hat, off the legacy site. It says School of Gaming loudly and engineer not at all — which is right for a fleet member and wrong for the one character whose job is the job.",
  },
  {
    id: "bare",
    label: "Bare-headed",
    note: "Everything left to the belt. Honest at 240 and gone by 64, where the belt is two pixels of grey and the portrait crop has cut it off anyway.",
  },
];

export function ChiefEngineerIdeas(): ReactElement {
  const beaver = engineerLook(ENGINEER_IDEAS[0]);
  return (
    <Panel
      title="Chief Engineer Kyle — ideas, not an answer"
      lede="The CTO has never had a character. Five species can carry the idea and none of them is obviously right, so all five are here under identical conditions — same pose, same mood, same size, same ground, same engineering-gold garment, same hardhat — and the only thing that varies is the species. Under each is the row that decides it: the portrait crops at 64, 40 and 28 pixels, where nearly every real use of a character lives. Above them is the question that came first, settled: hardhat, not goggles, and not the company beanie either. No Star Trek anywhere in it — no insignia, no uniform, no borrowed vocabulary. A glowing column and a gold hoodie are what an engine room looks like."
    >
      <div className="flex flex-wrap items-start justify-center gap-8 rounded-xl border border-border bg-background p-5">
        {ENGINEER_LOOKS.map((look) => (
          <figure key={look.id} className="flex w-[15rem] flex-col items-center gap-3">
            <Mascot
              {...beaver}
              outfit={look.hat === undefined ? { torso: "tool-belt" } : { hat: look.hat, torso: "tool-belt" }}
              pose={ENGINEER_POSE}
              expression={ENGINEER_MOOD}
              size={240}
            />
            <figcaption className="text-center text-xs leading-relaxed text-muted-foreground">
              <span className="block text-sm font-semibold text-foreground">{look.label}</span>
              {look.note}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-center gap-8 rounded-xl border border-border bg-background p-5">
        {ENGINEER_IDEAS.map((idea) => {
          const look = engineerLook(idea);
          return (
            <figure key={idea.id} className="flex w-[15rem] flex-col items-center gap-3">
              <Mascot {...look} pose={ENGINEER_POSE} expression={ENGINEER_MOOD} size={240} />
              <div className="flex items-end gap-3">
                {AVATAR_SIZES.map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1">
                    <Mascot {...look} crop="bust" size={size} animated={false} />
                    <span className="font-mono text-[10px] text-muted-foreground">{size}px</span>
                  </div>
                ))}
              </div>
              <figcaption className="text-center text-xs leading-relaxed text-muted-foreground">
                <span className="block text-sm font-semibold text-foreground">
                  {getConcept(idea.id).species}
                </span>
                {idea.caption}
              </figcaption>
            </figure>
          );
        })}
        <figure className="flex w-[22rem] flex-col items-center gap-3">
          <Mascot
            {...beaver}
            outfit={{ ...beaver.outfit, scene: "engine-room" }}
            pose={ENGINEER_POSE}
            expression={ENGINEER_MOOD}
            size={320}
          />
          <figcaption className="text-center text-xs leading-relaxed text-muted-foreground">
            <span className="block text-sm font-semibold text-foreground">The engine room</span>
            A place rather than a costume — the reactor column, the pipes, the gauges and a console
            to stand at, composable onto whichever candidate wins.
          </figcaption>
        </figure>
      </div>
    </Panel>
  );
}


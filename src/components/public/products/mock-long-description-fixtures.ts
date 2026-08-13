import {
  longDescriptionToMarkdown,
  type MarkdownHeadingLevel,
} from "@/lib/products/long-description-to-markdown";
import type { ProductDetailRow } from "@/services/products";
import type { AuthState } from "./signup-panel-view";
import type { RegistrationState } from "./derive-registration-state";
import { buildScenarioFixture } from "./mock-detail-fixtures";
import type { ProductLongDescription } from "@/types";

/**
 * **Fixtures for the one question the long-description format change cannot
 * answer on paper: how loud should a section heading be?**
 *
 * The stored field is a flat block array of headings and paragraphs, and a
 * `heading` block never carried a level — there was only one kind. Markdown
 * needs one, so the conversion has to pick, and the only honest way to pick is
 * to look at the same copy rendered both ways on the page it actually lands on:
 * full width, under the product's own `h1`, with the hero above it and the
 * signup rail beside it.
 *
 * So there are three scenarios over **one body of copy** — today's blocks, that
 * copy converted at `#`, and the same copy converted at `##`. Nothing else
 * differs between them: same product, same hero, same panel, same card, same
 * type scale. Anything that varied besides the heading level would be a second
 * variable in a one-variable comparison.
 */
export const LONG_DESCRIPTION_SCENARIOS = [
  "blocks-today",
  "markdown-h1",
  "markdown-h2",
] as const;

export type LongDescriptionScenario =
  (typeof LONG_DESCRIPTION_SCENARIOS)[number];

export function isLongDescriptionScenario(
  s: string,
): s is LongDescriptionScenario {
  return (LONG_DESCRIPTION_SCENARIOS as readonly string[]).includes(s);
}

/**
 * **The copy, as an admin has it stored today.**
 *
 * Written to the length and shape a real product page carries — four sections,
 * paragraphs that run past a screen's width, and the specifics a parent
 * actually scans for — because a heading scale judged against two short
 * paragraphs is judged against nothing.
 *
 * Three details in it are load-bearing rather than decorative, and each is
 * something an admin has genuinely typed into a plain-text field:
 *
 * - **A hand-typed list**, dash-prefixed lines inside one paragraph block. It
 *   is the closest the block format gets to a list, it renders as literal lines
 *   today, and the conversion has to keep it that way — a paragraph that
 *   quietly became a bulleted list would be the format change rewriting
 *   somebody's copy.
 * - **Punctuation that is markdown syntax**: a `3 * 3` door, a command with an
 *   underscore in it, a version number opening a line. All three would change
 *   how the surrounding text renders if they were passed through unescaped.
 * - **A line break inside a paragraph**, which the page shows today and must
 *   still show afterwards.
 */
export const LONG_DESCRIPTION_BLOCKS: ProductLongDescription = [
  { type: "heading", text: "What happens in a session" },
  {
    type: "paragraph",
    text: "Every week opens with a quick show-and-tell: whoever built something between sessions gets five minutes and a room full of questions. Then the group takes on one contraption together — a hidden 3 * 3 piston door, an item sorter that finally stops jamming, a wheat farm that harvests itself while everyone stands around arguing about whether it counts as cheating. The gedu builds alongside the group rather than in front of it, so nobody spends the hour watching somebody else's screen.",
  },
  {
    type: "paragraph",
    text: "There is no winning and no losing, and nothing is timed. A session that ends with one working machine and four half-finished ones is a good session; so is a session that ends with five children explaining the same bug to each other.",
  },
  { type: "heading", text: "Who it is for" },
  {
    type: "paragraph",
    text: "Ages 8 to 12, and the only thing we assume is that your child can move around a Minecraft world without help. Redstone itself we start from nothing — the first three weeks are levers, torches and repeaters, and by the end of the term the same children are reading each other's circuits and spotting where the signal dies.\nGroups are small enough that a quiet child is not going to disappear into the back of the room, which on a voice call is the thing that actually decides whether a club works.",
  },
  {
    type: "paragraph",
    text: "It suits a child who takes things apart. It suits a child who has watched forty hours of build videos and never got past the first step. It suits a child who has friends in the club already, which after a term is most of them.",
  },
  { type: "heading", text: "What your child takes away" },
  {
    type: "paragraph",
    text: "Logical thinking, mostly, in the form that sticks: a circuit either works or it does not, and finding out which is a habit rather than a lesson. Patience comes with it, and so does the quiet confidence of having made a machine do a thing on purpose. Then there are the friendships, which are the reason most of them come back — the same names turn up week after week, and by spring they are planning builds between sessions without anybody organising it.",
  },
  { type: "heading", text: "The practical bits" },
  {
    type: "paragraph",
    text: "Sessions run for an hour on our own private server, on a weekday evening, and we play the Java edition:\n1.21 and later is what the server runs, and it is what your child's launcher should be set to — the profile is the one called latest_release.\nEverything the group builds stays on the world between weeks, so nothing has to be finished on the night.",
  },
  {
    type: "paragraph",
    text: "What we ask you to have ready before the first session:\n- a computer that can run Minecraft: Java Edition\n- a headset with a microphone, wired if you have one\n- a corner of the house where an hour of talking is fine\n- your child's Minecraft username, so we can whitelist them",
  },
  {
    type: "paragraph",
    text: "If the launcher will not connect on the night, the fastest fix is nearly always the version: check it is 1.21 or later, then use /server list in the launcher's own console before mailing us. Anything else, mail us and we will sort it before the following week.",
  },
];

/**
 * **The section that only markdown can hold**, appended to the converted copy.
 *
 * It exists because the two markdown scenarios are not only about heading
 * size: the format also brings a real list and, for the first time on an
 * admin-authored field, links. Both are invisible if every scenario renders
 * copy the block format could already express — and a list rendered as bullets
 * next to the hand-typed one above is the clearest possible statement of what
 * changed.
 *
 * It is deliberately **absent from the blocks scenario**, because there is no
 * way to put it there: the block format has no list and no link. The first four
 * sections are identical across all three pages and are where the heading
 * question gets answered; this one is the postscript.
 *
 * The heading level is the scenario's, so the appended section sits in the same
 * hierarchy as the converted ones rather than introducing a fourth size.
 */
function newCapabilitiesSection(headingLevel: MarkdownHeadingLevel): string {
  const hashes = "#".repeat(headingLevel);
  return [
    `${hashes} Before the first session`,
    "There is nothing to install beyond the game itself — the server, the mods and the world are all ours. If you do not have a copy yet, the **Java edition** is the one you want, and it is the cheaper of the two:",
    [
      "- [Minecraft: Java & Bedrock Edition](https://www.minecraft.net/en-us/store/minecraft-deluxe-collection-pc), from Mojang's own store",
      "- a headset with a microphone — a phone's earbuds are fine",
      "- your child's Minecraft username, which we ask for at checkout",
    ].join("\n"),
    "Once you have signed up we mail you the server address and a short note about how the voice room works. How we look after your child's data while they are with us is set out in our [privacy policy](/privacy), and there is nothing else to do before the first evening.",
  ].join("\n\n");
}

/**
 * The markdown a scenario renders, or `null` for the one that renders today's
 * blocks instead.
 *
 * The conversion is run here rather than pasted in as a literal, so the scene
 * is looking at the output of the function that will do the real data
 * conversion — a preview of hand-written markdown would prove nothing about
 * either the escaping or the heading level.
 */
export function longDescriptionScenarioMarkdown(
  scenario: LongDescriptionScenario,
): string | null {
  if (scenario === "blocks-today") return null;
  const level: MarkdownHeadingLevel = scenario === "markdown-h1" ? 1 : 2;
  return [
    longDescriptionToMarkdown(LONG_DESCRIPTION_BLOCKS, level),
    newCapabilitiesSection(level),
  ].join("\n\n");
}

export interface LongDescriptionSceneFixture {
  product: ProductDetailRow;
  state: RegistrationState;
  authState: AuthState;
  /** The blurb as markdown, or null on the scenario that renders blocks. */
  markdown: string | null;
}

/**
 * The whole page's fixture: an ordinary open subscription club, with its blurb
 * swapped for the long copy above.
 *
 * Built on the product-detail fixtures rather than beside them, so everything
 * this comparison is *not* about — the hero, the chips, the facts card, the
 * signup panel and its live clock — is the same page the other product scenes
 * already show, and no second product row exists to drift from it.
 */
export function buildLongDescriptionSceneFixture(
  scenario: LongDescriptionScenario,
): LongDescriptionSceneFixture {
  const { product, state, authState } = buildScenarioFixture("consumer-club");
  return {
    product: {
      ...product,
      product_translations: product.product_translations.map(
        (translation) => ({
          ...translation,
          long_description: LONG_DESCRIPTION_BLOCKS,
        }),
      ),
    },
    state,
    authState,
    markdown: longDescriptionScenarioMarkdown(scenario),
  };
}

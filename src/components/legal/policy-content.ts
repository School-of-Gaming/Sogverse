import { z } from "zod";

/**
 * One chunk of a policy's copy, in the order the document reads: a paragraph,
 * or a bulleted list. Modelling the copy as an ordered sequence rather than
 * "some paragraphs, then maybe some bullets" is what lets a section run
 * paragraph → bullets → paragraph, which real legal drafting does constantly.
 */
export type PolicyBlock = { paragraph: string } | { bullets: string[] };

/**
 * The message shape behind {@link rawPolicyBlocks}: an array whose entries are
 * either a paragraph (a string) or a bulleted list (an array of strings). It
 * keeps a policy's copy in one message key per heading, so the JSON reads in
 * document order and a translator sees the same flow the page renders.
 */
const blocksSchema = z.array(z.union([z.string(), z.array(z.string())]));

/**
 * Validates an ordered blocks message (see {@link blocksSchema}) and turns it
 * into render-ready blocks. Throws loudly on a malformed message — a
 * build-content bug we want surfaced rather than silently dropped.
 */
export function rawPolicyBlocks(raw: unknown): PolicyBlock[] {
  return blocksSchema
    .parse(raw)
    .map((entry) =>
      typeof entry === "string" ? { paragraph: entry } : { bullets: entry },
    );
}

/**
 * The two-key message shape the older policies use — a run of paragraphs
 * followed by an optional bulleted list — expressed as blocks. Their message
 * files are unchanged; only the hand-off to the shared page component is.
 */
export function paragraphsThenBullets(
  paragraphs: string[],
  bullets?: string[],
): PolicyBlock[] {
  return [
    ...paragraphs.map((paragraph) => ({ paragraph })),
    ...(bullets && bullets.length > 0 ? [{ bullets }] : []),
  ];
}

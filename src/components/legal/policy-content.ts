import { z } from "zod";
import { ROUTES } from "@/lib/constants/routes";

/**
 * One chunk of a policy's copy, in the order the document reads: a paragraph,
 * or a bulleted list. Modelling the copy as an ordered sequence rather than
 * "some paragraphs, then maybe some bullets" is what lets a section run
 * paragraph → bullets → paragraph, which real legal drafting does constantly.
 */
export type PolicyBlock = { paragraph: string } | { bullets: string[] };

/**
 * The closed allow-list of cross-reference tags a policy string may carry, and
 * the page each one opens. Wherever one of our legal documents is named inside
 * another one's copy, the message wraps that name in the tag for the document
 * being named — `<linkRobloxPrivacy>Roblox Programme Privacy Policy</…>` — so
 * the translator writes their language's name for the document and never
 * chooses (or mistypes) a URL. One stable tag per document also means every
 * locale is protected mechanically: the unit suite compares each legal
 * namespace's tags against the English catalog, key for key, so a translation
 * that drops, renames or invents one fails CI rather than silently losing a
 * link in the one language nobody reviewing English would notice. (The
 * translation-completeness script does not look inside a value for tags — this
 * is the check that does.)
 *
 * **Only our own documents are in here, on purpose.** A reference to somebody
 * else's policy — Roblox's, Lynx's standard terms, a regulator's site — stays
 * plain text. That is an editorial decision about what we send families off to
 * read, not a limitation of this renderer, and it is the same shape as the
 * authored-markdown rule that bans `a` from the allow-list there.
 *
 * Hrefs come from `ROUTES` rather than string literals, so a moved page moves
 * its cross-references with it.
 */
const POLICY_LINK_HREFS = {
  linkPrivacy: ROUTES.privacy,
  linkTerms: ROUTES.termsAndConditions,
  linkDiscipline: ROUTES.antiBullying,
  linkRobloxPrivacy: ROUTES.robloxPrivacy,
  linkRobloxSafeguarding: ROUTES.robloxSafeguarding,
  linkRobloxTerms: ROUTES.robloxTerms,
} as const satisfies Record<string, string>;

type PolicyLinkTag = keyof typeof POLICY_LINK_HREFS;

function isPolicyLinkTag(tag: string): tag is PolicyLinkTag {
  return Object.hasOwn(POLICY_LINK_HREFS, tag);
}

/**
 * A run of policy copy, split into the pieces the page renders: plain text, or
 * a stretch of text that links to one of our other legal pages.
 */
export interface PolicySegment {
  /** The words to show. Already the final, translated text. */
  text: string;
  /** Internal path to link the text to; absent on a plain-text segment. */
  href?: string;
}

/**
 * Splits one policy string into {@link PolicySegment}s, turning the tags in
 * {@link POLICY_LINK_HREFS} into links and leaving everything else as text.
 *
 * **An unrecognised tag unwraps to its own words rather than becoming a link or
 * disappearing** — the same philosophy as the shared markdown renderer's
 * allow-list. A tag we don't know is a copy or translation mistake, and the
 * least harmful reading of a mistake in a binding document is "show the writer's
 * sentence intact"; dropping the run would delete a clause, and linking it would
 * invent a destination nobody chose. Malformed markup (an unclosed tag, a stray
 * `<`) never matches at all, so it survives as the literal text it already is.
 */
export function policyTextSegments(text: string): PolicySegment[] {
  // Declared here rather than at module scope: a `g` regex carries `lastIndex`
  // between calls, and a shared one would make each call depend on the last.
  const tagPattern = /<([A-Za-z][A-Za-z0-9]*)>([^<]*)<\/\1>/g;
  const segments: PolicySegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(text)) !== null) {
    const [whole, tag, label] = match;
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index) });
    }
    if (label.length > 0) {
      segments.push(
        isPolicyLinkTag(tag)
          ? { text: label, href: POLICY_LINK_HREFS[tag] }
          : { text: label },
      );
    }
    cursor = match.index + whole.length;
  }

  if (cursor === 0) return [{ text }];
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

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

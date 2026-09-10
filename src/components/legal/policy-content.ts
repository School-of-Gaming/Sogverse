import { z } from "zod";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import type { AppHref } from "@/lib/constants/routes";

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
 * **Only our own documents are in here, on purpose** — this map is internal
 * destinations, and the one class of outbound reference we do link lives in
 * {@link POLICY_EXTERNAL_HREFS} beside it. Everything else external stays plain
 * text: a third party's policy or standard terms (Roblox's, Lynx's) sits at a
 * URL we neither control nor watch, so a dead link in a binding document is
 * worse than a name the reader can search, and linking one implies we point at
 * the version that applies, which we cannot guarantee; a legal instrument (the
 * Standard Contractual Clauses, an adequacy decision, a private DPA) is often
 * not linkable at all. That is an editorial decision about what we send
 * families off to read, not a limitation of this renderer.
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
 * The closed allow-list of *outbound* tags, and the site each one opens. Same
 * shape and same guarantees as {@link POLICY_LINK_HREFS} — a named destination
 * held in code, a stable tag in the copy — so a translator still never chooses
 * a URL and the tag-parity test covers these unchanged.
 *
 * **Supervisory authorities only, and nothing else.** A regulator reference is
 * *rights-enabling*: the copy grants a right to complain, and a right nobody can
 * act on is decoration. Left as plain text these were broken in two different
 * ways — one rendered a bare `tietosuoja.fi` that looks like a link and is not,
 * and the other named no address at all in the document written for French
 * families. That reasoning is what separates them from every other external
 * reference (see the note on the internal map above): a third party's own
 * documents and the legal instruments a policy cites grant the reader nothing to
 * act on here, sit at URLs we do not control, and stay plain text.
 *
 * Homepages, not deep paths — a regulator's complaint page moves; its domain
 * does not.
 */
const POLICY_EXTERNAL_HREFS = {
  linkTietosuoja: "https://tietosuoja.fi",
  linkCnil: "https://www.cnil.fr",
} as const satisfies Record<string, string>;

type PolicyExternalTag = keyof typeof POLICY_EXTERNAL_HREFS;

function isPolicyExternalTag(tag: string): tag is PolicyExternalTag {
  return Object.hasOwn(POLICY_EXTERNAL_HREFS, tag);
}

/**
 * Values a policy string may name instead of spelling out, and where each one
 * really comes from. Same reasoning as the cross-reference allow-list above: a
 * message file should never carry a fact the app already defines elsewhere,
 * because the copy and the constant then drift apart silently — and in five
 * languages at once. The customer-facing address is the proof. It sat as a
 * literal in every legal document until there were three different addresses
 * across four of them, none of them the one the footer and the auth screens
 * showed, and no locale that disagreed could be spotted by reading English.
 *
 * These strings reach the renderer through `t.raw()` — the policy pages read
 * every block raw so ICU never touches the cross-reference tags — so next-intl
 * does not interpolate them and this substitution is what fills them in. The
 * braces are literal characters to this file, not ICU syntax. They are spelled
 * as ICU placeholders anyway because the translation-completeness script reads
 * them as such, which gets a locale that drops or renames one failed for free.
 *
 * An unrecognised `{placeholder}` is left exactly as written, like an unknown
 * tag: showing the writer's own text is the least harmful reading of a mistake
 * in a binding document.
 */
const POLICY_VALUES = {
  supportEmail: SUPPORT_EMAIL,
} as const satisfies Record<string, string>;

type PolicyValueName = keyof typeof POLICY_VALUES;

function isPolicyValueName(name: string): name is PolicyValueName {
  return Object.hasOwn(POLICY_VALUES, name);
}

/** Substitutes the {@link POLICY_VALUES} a string names, leaving the rest be. */
function fillPolicyValues(text: string): string {
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name: string) =>
    isPolicyValueName(name) ? POLICY_VALUES[name] : whole,
  );
}

/**
 * A run of policy copy, split into the pieces the page renders: plain text, a
 * stretch of text that links to one of our other legal pages, or one that links
 * off-site to a supervisory authority.
 */
export type PolicySegment =
  /** Plain words, no link. */
  | { text: string; href?: undefined; external?: undefined }
  /** A link to one of our own pages — a typed route, so it localizes. */
  | { text: string; href: AppHref; external?: undefined }
  /**
   * A link off-site, to a supervisory authority. `external` is a flag rather
   * than a sniff of the href: what a link *is* is decided by which allow-list
   * its tag came from, not by how its URL happens to read — and it is what
   * separates the two href types above, neither of which the other's renderer
   * can take.
   */
  | { text: string; href: string; external: true };

/**
 * Splits one policy string into {@link PolicySegment}s, turning the tags in
 * {@link POLICY_LINK_HREFS} and {@link POLICY_EXTERNAL_HREFS} into links and
 * leaving everything else as text. Both maps feed the one tag-matching path, so
 * an unknown tag behaves identically whichever list a reader expected it in.
 * Any {@link POLICY_VALUES} the string names are filled in first, so a value
 * that lands inside a linked run still reads as part of that run.
 *
 * This is where the filling happens because it is the one place *all* authored
 * policy prose passes through — the subtitle reaches the page component on its
 * own, not via the block builders below, so filling at ingest would miss it.
 *
 * **An unrecognised tag unwraps to its own words rather than becoming a link or
 * disappearing** — the same philosophy as the shared markdown renderer's
 * allow-list. A tag we don't know is a copy or translation mistake, and the
 * least harmful reading of a mistake in a binding document is "show the writer's
 * sentence intact"; dropping the run would delete a clause, and linking it would
 * invent a destination nobody chose. Malformed markup (an unclosed tag, a stray
 * `<`) never matches at all, so it survives as the literal text it already is.
 */
export function policyTextSegments(source: string): PolicySegment[] {
  const text = fillPolicyValues(source);
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
      if (isPolicyLinkTag(tag)) {
        segments.push({ text: label, href: POLICY_LINK_HREFS[tag] });
      } else if (isPolicyExternalTag(tag)) {
        segments.push({
          text: label,
          href: POLICY_EXTERNAL_HREFS[tag],
          external: true,
        });
      } else {
        segments.push({ text: label });
      }
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

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { OutboundLink } from "@/components/ui/outbound-link";
import {
  policyTextSegments,
  type PolicyBlock,
  type PolicySegment,
} from "./policy-content";

interface PolicySubsection {
  heading: string;
  blocks: PolicyBlock[];
}

interface PolicySection {
  heading: string;
  blocks: PolicyBlock[];
  /** Second-level headings under this section, in render order. */
  subsections?: PolicySubsection[];
}

interface PolicyPageProps {
  /** Page title, e.g. "Privacy Policy". */
  title: string;
  /**
   * One-line scope note under the title, where the document carries one. Goes
   * through the same cross-reference renderer as the body, because a scope note
   * is exactly where one document names another ("this sits alongside …").
   */
  subtitle?: string;
  /** Fully-formed "Last updated: …" line (already localized by the caller). */
  lastUpdated: string;
  /**
   * Localized "(opens in a new tab)", read out beside any outbound link the copy
   * carries. **Required, not optional**: whether a given document names a
   * regulator today is a property of the copy and can change in a translation
   * nobody reviewing English would open, so a page that supplies no label could
   * otherwise ship an unannounced outbound link the day a tag is added.
   */
  newTabLabel: string;
  /** Plain-language summary box shown up top. */
  intro: { heading: string; blocks: PolicyBlock[] };
  /** Body sections, in render order. */
  sections: PolicySection[];
}

/**
 * One line of policy copy, with any cross-reference rendered as a real link.
 * The copy arrives tagged from the message file and is split by
 * `policyTextSegments`, which owns the allow-lists and the hrefs; all this
 * decides is what a link looks like in body prose.
 *
 * A segment the splitter marked outbound goes through the shared `OutboundLink`,
 * the same component `/attributions` renders its credits with — so the two
 * readings are identical by construction rather than by a comment asking for it.
 * `PolicyPage` requires the label that component demands, so an outbound link
 * cannot ship unannounced.
 *
 * Emphasis is orthogonal to all of that: a segment the document bolds is wrapped
 * in a real `<strong>`, around the link if there is one, so a bolded document
 * name reads as one emphasised link rather than two adjacent runs. Body copy is
 * `text-muted-foreground` at the default weight, so `font-semibold` is what
 * reads as bold against it — the same weight the page's own subheadings take. The
 * weight has to be pushed onto any anchor inside the run as well, because a link
 * carries its own `font-medium` and that wins over an inherited weight: without
 * it a bold phrase ending in a linked acronym renders 600 up to the link and 500
 * on the link itself, and a bold run that is *entirely* a link never looks bold
 * at all. One arbitrary variant on the `<strong>` covers both, so the link's own
 * class list stays the one thing that decides what a link looks like.
 *
 * Neighbouring emphasised segments are gathered into **one** element before
 * rendering. The splitter has to hand emphasis back per segment, because a bold
 * run may contain a link and each side of it has its own destination; emitting
 * one `<strong>` per segment would turn the one bold phrase the document
 * actually carries — a regulator's name ending in a linked acronym — into two
 * adjacent ones, which reads the same today and would grow a seam the moment
 * emphasis gains anything but a weight.
 */
function PolicyText({
  text,
  newTabLabel,
}: {
  text: string;
  newTabLabel: string;
}) {
  const runs: { strong: boolean; segments: PolicySegment[] }[] = [];
  for (const segment of policyTextSegments(text)) {
    const strong = segment.strong === true;
    const open = runs.at(-1);
    if (open?.strong === strong) open.segments.push(segment);
    else runs.push({ strong, segments: [segment] });
  }

  const piece = (segment: PolicySegment, key: number) =>
    segment.href === undefined ? (
      <Fragment key={key}>{segment.text}</Fragment>
    ) : segment.external ? (
      <OutboundLink key={key} href={segment.href} label={newTabLabel}>
        {segment.text}
      </OutboundLink>
    ) : (
      <Link
        key={key}
        href={segment.href}
        className="rounded-sm font-medium text-act underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
      >
        {segment.text}
      </Link>
    );

  return (
    <>
      {runs.map((run, i) =>
        run.strong ? (
          <strong key={i} className="font-semibold [&_a]:font-semibold">
            {run.segments.map(piece)}
          </strong>
        ) : (
          <Fragment key={i}>{run.segments.map(piece)}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders a run of policy copy — paragraphs and bulleted lists, in order. */
function PolicyBlocks({
  blocks,
  newTabLabel,
}: {
  blocks: PolicyBlock[];
  newTabLabel: string;
}) {
  return (
    <>
      {blocks.map((block, i) =>
        "paragraph" in block ? (
          <p key={i} className="text-muted-foreground">
            <PolicyText text={block.paragraph} newTabLabel={newTabLabel} />
          </p>
        ) : (
          <ul
            key={i}
            className="list-disc space-y-2 pl-6 text-muted-foreground"
          >
            {block.bullets.map((bullet, bi) => (
              <li key={bi}>
                <PolicyText text={bullet} newTabLabel={newTabLabel} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/**
 * Shared layout for our plain-language legal pages (Privacy Policy, Terms &
 * Conditions, Anti-Bullying & Discipline, and the three Roblox Programme
 * documents — its privacy policy, safeguarding policy and terms).
 * Pure presentation: the caller owns the copy and pulls it from
 * `messages/*.json` with a literal next-intl namespace, so each page keeps full
 * message-key type safety while the markup lives in one place. A section
 * renders its own copy and then any second-level subsections beneath it.
 *
 * Every string of body copy (subtitle, paragraphs, bullets) may name one of our
 * other legal pages, or one of the supervisory authorities a reader has the
 * right to complain to, through a cross-reference tag that becomes a link here;
 * see `policy-content.ts` for the two allow-lists. It may also carry the
 * emphasis its source document emphasises, through the one markup tag beside
 * them. Headings and the "last updated" line are structural rather than authored
 * prose, so they render as plain text.
 */
export function PolicyPage({
  title,
  subtitle,
  lastUpdated,
  newTabLabel,
  intro,
  sections,
}: PolicyPageProps) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground">
            <PolicyText text={subtitle} newTabLabel={newTabLabel} />
          </p>
        )}
        <p className="text-sm text-muted-foreground">{lastUpdated}</p>
      </div>

      {/* Plain-language summary up top — the one part we most want a hurried
          parent to actually read. */}
      <div className="mt-8 space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{intro.heading}</h2>
        <PolicyBlocks blocks={intro.blocks} newTabLabel={newTabLabel} />
      </div>

      <div className="mt-10 space-y-10">
        {sections.map((section, si) => (
          <section key={si} className="space-y-3">
            <h2 className="text-2xl font-bold">{section.heading}</h2>
            <PolicyBlocks blocks={section.blocks} newTabLabel={newTabLabel} />
            {section.subsections?.map((subsection, sub) => (
              <div key={sub} className="space-y-3 pt-3">
                <h3 className="text-xl font-semibold">{subsection.heading}</h3>
                <PolicyBlocks
                  blocks={subsection.blocks}
                  newTabLabel={newTabLabel}
                />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

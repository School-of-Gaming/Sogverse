import Link from "next/link";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { policyTextSegments, type PolicyBlock } from "./policy-content";

interface PolicySubsection {
  heading: string;
  blocks: PolicyBlock[];
}

interface PolicySection {
  heading: string;
  blocks: PolicyBlock[];
  /** Second-level headings under this section, in render order. */
  subsections?: PolicySubsection[];
  /**
   * Set where the source document has a gap we refuse to invent copy for — a
   * list that was never written, a section that does not exist yet, a contact
   * address nobody has decided on. Rendered after the section's own copy as a
   * visible marker, so a reader can tell "not written yet" apart from "not
   * applicable" instead of meeting a silently short section.
   */
  pending?: string;
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
  /**
   * Set while the document is a draft: renders a prominent banner above the
   * summary box saying so. Omitted once the copy is signed off — a page with
   * no banner is a page whose text is final.
   */
  draftNotice?: string;
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
 * A segment the splitter marked outbound gets the same treatment `/attributions`
 * gives its credits: a new tab, `rel="noopener noreferrer"`, the arrow glyph for
 * a reader who can see it and `newTabLabel` for one who cannot. `PolicyPage`
 * requires that label, so an outbound link cannot ship unannounced.
 */
function PolicyText({
  text,
  newTabLabel,
}: {
  text: string;
  newTabLabel: string;
}) {
  return (
    <>
      {policyTextSegments(text).map((segment, i) => {
        if (segment.href === undefined) return segment.text;
        return segment.external ? (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm font-medium text-act underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
          >
            {segment.text}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">{newTabLabel}</span>
          </a>
        ) : (
          <Link
            key={i}
            href={segment.href}
            className="rounded-sm font-medium text-act underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
          >
            {segment.text}
          </Link>
        );
      })}
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
 * Marks a heading whose copy the source document has not supplied yet. Quieter
 * than the page-level draft banner and louder than body text: the reader is
 * meant to notice the hole rather than read past it.
 */
function PendingNotice({ notice }: { notice: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border px-4 py-3">
      <TriangleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-warning"
        aria-hidden="true"
      />
      <p className="text-sm italic text-muted-foreground">{notice}</p>
    </div>
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
 * see `policy-content.ts` for the two allow-lists. Headings, the "last updated" line
 * and the draft/pending notices are structural rather than authored prose, so
 * they render as plain text.
 */
export function PolicyPage({
  title,
  subtitle,
  lastUpdated,
  newTabLabel,
  draftNotice,
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

      {/* Above the summary box, not below it: a reader who takes only the
          short version still has to pass the "this is not final" warning. */}
      {draftNotice && (
        <div
          role="note"
          className="mt-8 flex items-start gap-4 rounded-lg border-2 border-warning p-5 sm:p-6"
        >
          <TriangleAlert
            className="mt-0.5 h-7 w-7 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p className="text-base font-bold leading-relaxed sm:text-lg">
            {draftNotice}
          </p>
        </div>
      )}

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
            <PolicyBlocks
              blocks={section.blocks}
              newTabLabel={newTabLabel}
            />
            {section.subsections?.map((subsection, sub) => (
              <div key={sub} className="space-y-3 pt-3">
                <h3 className="text-xl font-semibold">{subsection.heading}</h3>
                <PolicyBlocks
                  blocks={subsection.blocks}
                  newTabLabel={newTabLabel}
                />
              </div>
            ))}
            {section.pending && <PendingNotice notice={section.pending} />}
          </section>
        ))}
      </div>
    </div>
  );
}

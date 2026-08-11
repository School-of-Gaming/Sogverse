import type { PolicyBlock } from "./policy-content";

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
  /** One-line scope note under the title, where the document carries one. */
  subtitle?: string;
  /** Fully-formed "Last updated: …" line (already localized by the caller). */
  lastUpdated: string;
  /** Plain-language summary box shown up top. */
  intro: { heading: string; blocks: PolicyBlock[] };
  /** Body sections, in render order. */
  sections: PolicySection[];
}

/** Renders a run of policy copy — paragraphs and bulleted lists, in order. */
function PolicyBlocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        "paragraph" in block ? (
          <p key={i} className="text-muted-foreground">
            {block.paragraph}
          </p>
        ) : (
          <ul
            key={i}
            className="list-disc space-y-2 pl-6 text-muted-foreground"
          >
            {block.bullets.map((bullet, bi) => (
              <li key={bi}>{bullet}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/**
 * Shared layout for our plain-language legal pages (Privacy Policy, Terms &
 * Conditions, Anti-Bullying & Discipline, the Roblox Programme Privacy Policy).
 * Pure presentation: the caller owns the copy and pulls it from
 * `messages/*.json` with a literal next-intl namespace, so each page keeps full
 * message-key type safety while the markup lives in one place. A section
 * renders its own copy and then any second-level subsections beneath it.
 */
export function PolicyPage({
  title,
  subtitle,
  lastUpdated,
  intro,
  sections,
}: PolicyPageProps) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        <p className="text-sm text-muted-foreground">{lastUpdated}</p>
      </div>

      {/* Plain-language summary up top — the one part we most want a hurried
          parent to actually read. */}
      <div className="mt-8 space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{intro.heading}</h2>
        <PolicyBlocks blocks={intro.blocks} />
      </div>

      <div className="mt-10 space-y-10">
        {sections.map((section, si) => (
          <section key={si} className="space-y-3">
            <h2 className="text-2xl font-bold">{section.heading}</h2>
            <PolicyBlocks blocks={section.blocks} />
            {section.subsections?.map((subsection, sub) => (
              <div key={sub} className="space-y-3 pt-3">
                <h3 className="text-xl font-semibold">{subsection.heading}</h3>
                <PolicyBlocks blocks={subsection.blocks} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

interface PolicySection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface PolicyPageProps {
  /** Page title, e.g. "Privacy Policy". */
  title: string;
  /** Fully-formed "Last updated: …" line (already localized by the caller). */
  lastUpdated: string;
  /** Plain-language summary box shown up top. */
  intro: { heading: string; paragraphs: string[] };
  /** Body sections, in render order. */
  sections: PolicySection[];
}

/**
 * Shared layout for our plain-language legal pages (Privacy Policy, Terms &
 * Conditions, Anti-Bullying & Discipline). Pure presentation: the caller owns
 * the copy and pulls it from `messages/*.json` with a literal next-intl
 * namespace, so each page keeps full message-key type safety while the markup
 * lives in one place. Each section renders a heading, its paragraphs, and an
 * optional bulleted list.
 */
export function PolicyPage({
  title,
  lastUpdated,
  intro,
  sections,
}: PolicyPageProps) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{lastUpdated}</p>
      </div>

      {/* Plain-language summary up top — the one part we most want a hurried
          parent to actually read. */}
      <div className="mt-8 space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{intro.heading}</h2>
        {intro.paragraphs.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            {p}
          </p>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        {sections.map((section, si) => (
          <section key={si} className="space-y-3">
            <h2 className="text-2xl font-bold">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-muted-foreground">
                {p}
              </p>
            ))}
            {section.bullets && section.bullets.length > 0 && (
              <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                {section.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

import { useTranslations } from "next-intl";

/**
 * ============================================================================
 * PLACEHOLDER CONTENT — NOT FOR PUBLICATION.
 * ============================================================================
 *
 * Lorem ipsum standing in for the programme's real questions and answers, which
 * are still being written with Lynx Educate. It is deliberately hardcoded here
 * rather than added to `messages/`: placeholder copy in a message catalog is
 * copy five locales get asked to translate and that reads, to anyone grepping
 * the catalog later, like a shipping feature. Lorem in a component is
 * unmistakable and greppable — searching for "Lorem ipsum" finds every word of
 * it — and `/roblox` is noindex, unlinked and shared by URL alone while the
 * programme copy is unsigned, so nobody meets it by accident.
 *
 * When the real Q&A lands, these literals move into `roblox.faq` in all five
 * locale files and this array goes away; the heading is already a real key, so
 * the section's frame does not change.
 *
 * A flat list, not an accordion: placeholder content is not worth interactive
 * machinery, and four short answers read faster open than they would behind
 * four taps. Revisit that when the real answers arrive and their length is
 * known.
 */
const PLACEHOLDER_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Lorem ipsum dolor sit amet, consectetur adipiscing elit?",
    answer:
      "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  },
  {
    question: "Duis aute irure dolor in reprehenderit in voluptate?",
    answer:
      "Velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  },
  {
    question: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur?",
    answer:
      "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.",
  },
  {
    question: "Quis autem vel eum iure reprehenderit qui in ea voluptate?",
    answer:
      "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
  },
];

/**
 * The programme's FAQ. The heading is real, translated copy; everything under
 * it is the placeholder above, awaiting the signed-off Q&A.
 *
 * Tinted ground so it separates the plain "For parents" section above it from
 * the plain closing CTA below — the page alternates plain and tinted bands, and
 * three plain sections in a row would read as one.
 */
export function ProgrammeFaq() {
  const t = useTranslations("roblox.faq");

  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>
          <dl className="mt-12 space-y-8">
            {PLACEHOLDER_FAQ.map((item) => (
              <div key={item.question}>
                <dt className="text-lg font-semibold">{item.question}</dt>
                <dd className="mt-2 leading-7 text-muted-foreground">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

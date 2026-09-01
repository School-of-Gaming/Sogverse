import { useTranslations } from "next-intl";
import { FaqAccordion, type FaqAccordionItem } from "@/components/ui/faq-accordion";

/**
 * The public FAQ's questions, in the order a stranger meets them: what we are,
 * what the three things we sell are, who runs a session, whether it is safe for
 * a child, and how to begin.
 *
 * **The order is load-bearing and lives here, not in the message files**, so
 * every locale renders the same sequence. Each key names an
 * `about.faq.items.<key>` entry in all five catalogs.
 *
 * The list is seeded with the five answers the public help page carried and
 * grows one question at a time: a new entry costs its message keys plus one
 * line here, and nothing structural.
 */
const FAQ_ITEM_KEYS = [
  "whatIsSogverse",
  "productTypes",
  "whoLeads",
  "safety",
  "howToStart",
] as const;

interface AboutFaqProps {
  /** Anchor id for the section nav. */
  id?: string;
}

/**
 * The About page's FAQ section: the heading plus the shared accordion list.
 *
 * The heading is drawn here rather than by the accordion because it is the
 * half that must disappear with the list — an empty key array has to leave no
 * trace on the page at all, and a heading over nothing is exactly the dead
 * space the layout rules forbid.
 *
 * Answers are plain paragraphs: this copy carries no links by design. The
 * footer already puts the support address on every public page, and pointing a
 * reader out of an answer is a decision to make per question, not a default.
 */
export function AboutFaq({ id }: AboutFaqProps) {
  const t = useTranslations("about.faq");

  const items: FaqAccordionItem[] = FAQ_ITEM_KEYS.map((key) => ({
    key,
    question: t(`items.${key}.question`),
    answer: <p>{t(`items.${key}.answer`)}</p>,
  }));

  if (items.length === 0) return null;

  return (
    // The `py-16` is what clears the /about section pill on an anchor landing —
    // the scroll offset covers the header only. See `section-pill.tsx`.
    <section
      id={id}
      className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <div className="mt-12">
          <FaqAccordion items={items} />
        </div>
      </div>
    </section>
  );
}

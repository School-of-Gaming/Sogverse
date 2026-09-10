import { useTranslations } from "next-intl";
import { FaqAccordion, type FaqAccordionItem } from "@/components/ui/faq-accordion";
import { FAQ_ANSWER_TAGS } from "@/components/ui/faq-answer";
import { JsonLd } from "@/components/seo/json-ld";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { messageToPlainText } from "@/lib/i18n/plain-text";

/**
 * The public FAQ's questions, ordered for a parent deciding whether to sign
 * their child up: who we are, then the practical questions, then the safety
 * block, then how to start, and last the one question on the page a parent is
 * not asking — how to become a Game Educator.
 *
 * **The order is load-bearing and lives here, not in the message files**, so
 * every locale renders the same sequence. Each key names an
 * `about.faq.items.<key>` entry in all five catalogs.
 *
 * The list grows one question at a time: a new entry costs its message keys
 * plus one line here, and nothing structural.
 *
 * **Exported because `llms.txt` writes the same questions out in the same
 * order.** One list, so the plain-text file for machines and the page for
 * people cannot come to hold different questions.
 */
export const FAQ_ITEM_KEYS = [
  "whatIsSogverse",
  "isItASchool",
  "ages",
  "games",
  "equipment",
  "productTypes",
  "billing",
  "cancellation",
  "severalChildren",
  "languages",
  "municipalityClubs",
  "whoLeads",
  "safety",
  "gamerAccounts",
  "childData",
  "howToStart",
  "becomeGedu",
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
 * Answers carry their own block structure — paragraphs, and a bulleted list
 * where the answer is really an inventory — from the catalog rather than from
 * this component, so each locale breaks its copy where its own sentences fall.
 * They carry no links by design. The
 * footer already puts the support address on every public page, and pointing a
 * reader out of an answer is a decision to make per question, not a default.
 * The two answers that *name* that address take it as a `{supportEmail}` value
 * rather than spelling it out — a literal in `messages/` is how the legal pages
 * once ended up with three different addresses across five languages — and it
 * still renders as text, not as a link.
 */
export function AboutFaq({ id }: AboutFaqProps) {
  const t = useTranslations("about.faq");

  const items: FaqAccordionItem[] = FAQ_ITEM_KEYS.map((key) => ({
    key,
    question: t(`items.${key}.question`),
    answer: t.rich(`items.${key}.answer`, {
      ...FAQ_ANSWER_TAGS,
      supportEmail: SUPPORT_EMAIL,
    }),
  }));

  if (items.length === 0) return null;

  // The same questions and answers a search engine or an assistant can read
  // without parsing the accordion. It is emitted here, inside the early-return
  // guard, so the structured data and the rendered list are the same set by
  // construction: a page with no FAQ advertises none. The answers come from
  // `t.raw` rather than from the rendered nodes — `acceptedAnswer.text` wants
  // the words, and the tag markup is layout.
  const faqPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEM_KEYS.map((key) => ({
      "@type": "Question",
      name: t(`items.${key}.question`),
      acceptedAnswer: {
        "@type": "Answer",
        text: messageToPlainText(t.raw(`items.${key}.answer`), {
          supportEmail: SUPPORT_EMAIL,
        }),
      },
    })),
  };

  return (
    // The `py-16` is what clears the /about section pill on an anchor landing —
    // the scroll offset covers the header only. See `section-pill.tsx`.
    <section
      id={id}
      className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24"
    >
      <JsonLd data={faqPageJsonLd} />
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

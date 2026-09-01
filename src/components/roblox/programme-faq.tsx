import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  FaqAccordion,
  type FaqAccordionItem,
} from "@/components/ui/faq-accordion";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";

/**
 * The Programme's questions and answers, in the order Lynx Educate signed them
 * off — general first, then the practical detail a parent needs before booking,
 * then the three that answer a worry (data, photography, who is in the room),
 * and the contact address last.
 *
 * **The order is load-bearing.** It is owned here rather than by the message
 * files so every locale renders the same sequence, and each key names a
 * `roblox.faq.items.<key>` entry in all five catalogs. Reordering this array
 * reorders the FAQ in every language at once; renaming a key is a five-file
 * change.
 *
 * Two answers run to a second part, and each is spelled out at its own render
 * site below rather than expressed as a flag here: the extra paragraph is not
 * uniform (one is a full second paragraph, one a subordinate note), and naming
 * the two message keys literally is what keeps them under the compiler's eye.
 */
const FAQ_ITEM_KEYS = [
  "programme",
  "eligibility",
  "cost",
  "experience",
  "where",
  "language",
  "equipment",
  "dataSharing",
  "media",
  "facilitators",
  "contact",
] as const;

/** Inline link styling shared by the three links the answers can carry. */
const ANSWER_LINK_CLASS =
  "text-primary underline underline-offset-4 hover:no-underline";

/**
 * The Programme's FAQ: the signed-off Lynx Educate copy, translated in every
 * locale, behind the shared `FaqAccordion`.
 *
 * The rows are the shared component's; everything the Programme page adds to
 * them is composed here, which is the division that keeps the shared layer from
 * growing a prop per page. The tinted band and the heading are this page's, and
 * so is every answer: each is handed over already rendered, links, second
 * paragraphs and all, so the accordion never resolves a string or a rich-text
 * tag on the Programme's behalf.
 *
 * Tinted ground so it separates the plain "For parents" section above it from
 * the plain closing CTA below — the page alternates plain and tinted bands, and
 * three plain sections in a row would read as one.
 */
export function ProgrammeFaq() {
  const t = useTranslations("roblox.faq");

  /**
   * Every tag and value an answer may name, handed to every answer. Two of the
   * Programme's own documents are cited by name in the copy, and the name is
   * the link — the translator writes their language's name for the document
   * inside the tag and never picks a URL. `email` fills the support address
   * from the constant, so the copy cannot drift from the one the footer and the
   * auth screens show.
   */
  const answerTags = {
    email: SUPPORT_EMAIL,
    linkPrivacy: (chunks: ReactNode) => (
      <Link href={ROUTES.robloxPrivacy} className={ANSWER_LINK_CLASS}>
        {chunks}
      </Link>
    ),
    linkSafeguarding: (chunks: ReactNode) => (
      <Link href={ROUTES.robloxSafeguarding} className={ANSWER_LINK_CLASS}>
        {chunks}
      </Link>
    ),
    linkEmail: (chunks: ReactNode) => (
      <a href={`mailto:${SUPPORT_EMAIL}`} className={ANSWER_LINK_CLASS}>
        {chunks}
      </a>
    ),
  };

  const items: FaqAccordionItem[] = FAQ_ITEM_KEYS.map((key) => ({
    key,
    question: t(`items.${key}.question`),
    answer: (
      <>
        <p>{t.rich(`items.${key}.answer`, answerTags)}</p>
        {/* The equipment answer's second half: what each format expects a
            family to bring, which is a full paragraph. */}
        {key === "equipment" && <p>{t("items.equipment.answer2")}</p>}
        {/* The locations answer's closing aside, subordinate in the signed-off
            copy and rendered as one. */}
        {key === "where" && (
          <p className="text-sm italic text-muted-foreground/80">
            {t("items.where.answer2")}
          </p>
        )}
      </>
    ),
  }));

  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>
          <div className="mt-12">
            <FaqAccordion items={items} />
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useTranslations } from "next-intl";
import {
  FaqAccordion,
  type FaqAccordionItem,
} from "@/components/ui/faq-accordion";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * The role FAQs, one exported component per dashboard.
 *
 * **Each role owns its own question order in its own key array**, exactly as
 * the About page's FAQ does, so every locale renders the same sequence and no
 * ordering knowledge leaks into a shared layer. The three live in one file
 * because they share one block of markup and nothing else; three files would
 * have been three copies of the heading.
 *
 * **An empty list renders nothing at all** — no heading, no card, no reserved
 * space. A slot held open for copy that does not exist is dead space, and a
 * placeholder answer is copy we would be shipping to a family. Adding a
 * question costs its two message keys in all five locales plus one line in the
 * array below, and nothing structural.
 *
 * The arrays are `as const`, which is what makes that promise
 * compiler-checked: each entry narrows the key to its own literal, the composed
 * lookup below resolves to a real message key, and a key naming a question with
 * no message behind it fails the build.
 *
 * **The `as const` on each composed key is load-bearing**, and is the one thing
 * here that looks removable and is not. A template literal is otherwise widened
 * to `string`, which the translator's key parameter rejects the moment an array
 * has no entries to narrow it — so without the assertion a list becomes
 * uncompilable exactly when it is emptied, which is the state all three shipped
 * in and any of them could return to.
 *
 * Answers are single plain paragraphs, the same shape the About page's FAQ
 * uses. The one that names the support address takes it as a `{supportEmail}`
 * value rather than spelling it out, and it stays text: the form directly above
 * every one of these lists already carries the live mailto for the two adult
 * roles, and a second one inside an answer would be the same link twice.
 */

/** Parent operating questions — the parent PIN, reports, absences, times. */
const PARENT_FAQ_KEYS = [
  "parentPin",
  "sessionReports",
  "missedSessions",
  "sessionTimes",
] as const;

/** Gamer questions, child-facing — getting in, being heard, being treated well. */
const GAMER_FAQ_KEYS = [
  "joiningSession",
  "micTrouble",
  "someoneIsMean",
] as const;

/** Gedu operating questions — certification, assignment, the two escalations. */
const GEDU_FAQ_KEYS = [
  "certification",
  "groupAssignment",
  "safeguardingConcern",
  "gamerCannotConnect",
] as const;

export function ParentHelpFaq() {
  const t = useTranslations("parent");

  return (
    <HelpFaqBlock
      items={PARENT_FAQ_KEYS.map((key) => ({
        key,
        question: t(`helpFaq.items.${key}.question` as const),
        answer: (
          <p>
            {t(`helpFaq.items.${key}.answer` as const, {
              supportEmail: SUPPORT_EMAIL,
            })}
          </p>
        ),
      }))}
    />
  );
}

export function GamerHelpFaq() {
  const t = useTranslations("gamer");

  return (
    <HelpFaqBlock
      items={GAMER_FAQ_KEYS.map((key) => ({
        key,
        question: t(`helpFaq.items.${key}.question` as const),
        answer: (
          <p>
            {t(`helpFaq.items.${key}.answer` as const, {
              supportEmail: SUPPORT_EMAIL,
            })}
          </p>
        ),
      }))}
    />
  );
}

export function GeduHelpFaq() {
  const t = useTranslations("gedu");

  return (
    <HelpFaqBlock
      items={GEDU_FAQ_KEYS.map((key) => ({
        key,
        question: t(`helpFaq.items.${key}.question` as const),
        answer: (
          <p>
            {t(`helpFaq.items.${key}.answer` as const, {
              supportEmail: SUPPORT_EMAIL,
            })}
          </p>
        ),
      }))}
    />
  );
}

/**
 * The heading plus the shared accordion — or nothing.
 *
 * The heading is drawn here rather than by the accordion because it is the half
 * that has to disappear with the list: a heading over nothing is exactly the
 * dead reserved space the layout rules forbid, and only the caller can know
 * there is nothing to head.
 */
function HelpFaqBlock({ items }: { items: readonly FaqAccordionItem[] }) {
  const t = useTranslations("helpSection");

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">{t("faqHeading")}</h3>
      <FaqAccordion items={items} />
    </div>
  );
}

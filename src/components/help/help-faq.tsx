"use client";

import { useTranslations } from "next-intl";
import {
  FaqAccordion,
  type FaqAccordionItem,
} from "@/components/ui/faq-accordion";
import { FAQ_ANSWER_TAGS } from "@/components/ui/faq-answer";
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
 * Answers are block-structured markup in the catalog rather than one paragraph
 * each — see the shared tag vocabulary — so a locale breaks its own copy where
 * its own sentences want breaking, and an answer that is really a procedure can
 * be a numbered list. The one that names the support address takes it as a
 * `{supportEmail}` value rather than spelling it out, and it stays text: the
 * form directly above every one of these lists already carries the live mailto
 * for the two adult roles, and a second one inside an answer would be the same
 * link twice.
 */

/** Parent operating questions — the parent PIN, reports, absences, times. */
const PARENT_FAQ_KEYS = [
  "parentPin",
  "sessionReports",
  "missedSessions",
  "sessionTimes",
] as const;

/**
 * Gamer questions, child-facing — getting in, being heard, hearing the others,
 * being treated well.
 *
 * **The two microphone questions are deliberately separate entries**, though
 * one combined answer once covered both. A child who cannot be heard and a
 * child who cannot hear are looking for different words and need different
 * checks — a mute button and a device picker on one side, the volume and which
 * zone they are standing in on the other — and a single answer made each of
 * them read past the half that was not theirs.
 */
const GAMER_FAQ_KEYS = [
  "joiningSession",
  "cannotBeHeard",
  "cannotHearOthers",
  "someoneIsMean",
] as const;

/**
 * Gedu operating questions, ordered the way a gedu meets them: getting started,
 * then running a session, then the two escalations.
 *
 * The two attendance entries are the questions gedus actually ask, and they ask
 * them at different times — how the register works, before a first club; why a
 * session is still flagged, weeks later. The alert entry stands in for what the
 * badge itself does not yet say, which is *which* of its four conditions is
 * unmet.
 */
const GEDU_FAQ_KEYS = [
  "certification",
  "groupAssignment",
  "takingAttendance",
  "attendanceAlert",
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
        answer: t.rich(`helpFaq.items.${key}.answer` as const, {
          ...FAQ_ANSWER_TAGS,
          supportEmail: SUPPORT_EMAIL,
        }),
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
        answer: t.rich(`helpFaq.items.${key}.answer` as const, {
          ...FAQ_ANSWER_TAGS,
          supportEmail: SUPPORT_EMAIL,
        }),
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
        answer: t.rich(`helpFaq.items.${key}.answer` as const, {
          ...FAQ_ANSWER_TAGS,
          supportEmail: SUPPORT_EMAIL,
        }),
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

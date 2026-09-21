"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { GeduAssignmentsSectionView } from "./GeduAssignmentsSectionView";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { GeduSubstitutionSummary } from "@/lib/gedu-assignment-rollup";

/**
 * The Substitutions page's body — everything below the route's data shell.
 *
 * **One page, two questions, in the order they matter.** Sessions needing a
 * substitute come first: they are other people's absences, they expire, and a
 * session nobody answers has nobody in the room — which is the thing this page
 * exists to prevent. What the reader has already taken comes second, because it
 * is settled: it is on My SOG as well, among the gedu's own groups, and it is
 * here so that everything the word *substitution* means to them is in one
 * place.
 *
 * It lives apart from the route so the page is only a data shell (auth,
 * prefetch) and the body is a plain component: that is what lets a full-page
 * preview scene render it exactly as a gedu meets it, with fixtures in place of
 * the server reads.
 *
 * **No section pill.** Two sections fit on one screen at the width this page is
 * designed for, and a nav bar over a page you can already see the whole of is
 * furniture with nothing to do.
 */
export function GeduSubstitutionsPageBody({
  pool,
  fileAbsence = null,
  substitutions,
}: {
  /**
   * The way into filing an absence, or `null` for a gedu with nothing to file
   * against.
   *
   * A node rather than a list, the same split the pool takes: it owns a dialog
   * and a write, so the shell hands it over finished and a preview scene hands
   * over the same component with the write made inert. It sits under the title
   * because that is where somebody who came to this page *because* they cannot
   * make a session looks first — and it is quiet, because the one act this page
   * is asking for is offering to substitute.
   */
  fileAbsence?: React.ReactNode | null;
  /**
   * The open queue's body, or `null` for a gedu who has no business seeing it.
   *
   * A node rather than rows, the same split the dashboard's tool panels take:
   * the pool is a self-contained thing with two backend writes behind it, so
   * the shell hands it over finished and a preview scene hands over the same
   * component over fixtures. `null` withholds the heading with the body, and it
   * means exactly one thing — an **uncertified** gedu, who may substitute for
   * nothing and would be reading an all-clear about a queue they are not in.
   * A read that has not answered yet is the node's own business and renders
   * nothing under a heading that is already on the page.
   */
  pool: React.ReactNode | null;
  /**
   * The substitutions this gedu is holding, soonest first — or `null` while the
   * read behind them has not answered.
   *
   * `null` is not an empty list: an empty list says in words that nothing is
   * coming up, and saying that on the strength of a read that has not returned
   * is the one wrong answer available here.
   */
  substitutions: readonly GeduSubstitutionSummary[] | null;
}) {
  const t = useTranslations("gedu.substitution");

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-24">
      {/* The way back, because this page is reached from My SOG and is not a
          step in anything — the same escape the contract page carries. */}
      <Link
        href={ROUTES.gedu.dashboard}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
        {fileAbsence}
      </div>

      {/* Withheld whole for an account that may substitute for nothing —
          heading included, because a heading over a queue this gedu is not in
          is a section that can only ever be empty. */}
      {pool !== null && (
        <section
          aria-labelledby="substitution-pool-heading"
          className="space-y-4"
        >
          <h2 id="substitution-pool-heading" className="text-xl font-semibold">
            {t("poolHeading")}
          </h2>
          {pool}
        </section>
      )}

      <section aria-labelledby="substitutions-mine-heading" className="space-y-4">
        <h2 id="substitutions-mine-heading" className="text-xl font-semibold">
          {t("mineHeading")}
        </h2>
        {/* Nothing at all while the read is out — a small indexed read of a
            bounded set lands in a frame or two, and the ordinary visit has it
            server-prefetched before this page paints. An empty list is a
            different answer and says so. */}
        {substitutions === null ? null : substitutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("mineAllClear")}</p>
        ) : (
          // The same grid and the same card My SOG draws these in, because they
          // are the same seats seen from a different page.
          <GeduAssignmentsSectionView
            items={substitutions.map((substitution) => ({
              kind: "substitution" as const,
              item: substitution,
            }))}
          />
        )}
      </section>
    </div>
  );
}

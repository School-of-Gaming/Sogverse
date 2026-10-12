"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { GeduAssignmentsSectionView } from "./GeduAssignmentsSectionView";
import { GeduOwnSubstitutionRequestsSection } from "./GeduOwnSubstitutionRequestsSection";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { GeduSubstitutionSummary } from "@/lib/gedu-assignment-rollup";
import type { OwnSubstitutionRequestRow } from "@/lib/gedu-own-substitution-requests";

/**
 * The Substitutions page's body — everything below the route's data shell.
 *
 * **The reader's own absences, then the two questions, in the order they
 * matter.** The gedu's own live requests come first where there are any — a
 * gedu who has asked for a substitute comes here to see whether anybody is
 * coming *(owner, 2026-10)* — and the section is not drawn at all where there
 * are none, because it is about something the reader did rather than a list
 * they are owed an all-clear on. Sessions needing a substitute come next: they
 * are other people's absences, they expire, and a session nobody answers has
 * nobody in the room — which is the thing this page exists to prevent. What the
 * reader has already taken comes last, because it is settled: it is on My SOG as
 * well, among the gedu's own groups, and it is here so that everything the word
 * *substitution* means to them is in one place.
 *
 * It lives apart from the route so the page is only a data shell (auth,
 * prefetch) and the body is a plain component: that is what lets a full-page
 * preview scene render it exactly as a gedu meets it, with fixtures in place of
 * the server reads.
 *
 * **No section pill.** Each section is a handful of cards at the width this page
 * is designed for, and a nav bar over a page you can take in at a scroll is
 * furniture with nothing to do.
 */
export function GeduSubstitutionsPageBody({
  pool,
  fileAbsence = null,
  ownRequests,
  onWithdrawOwnRequest,
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
   * The reader's own live requests, soonest first — or `null` while the read
   * behind them has not answered.
   *
   * Empty and `null` draw the same thing, which is nothing, heading included:
   * the section exists only while the reader has a request to follow.
   */
  ownRequests: readonly OwnSubstitutionRequestRow[] | null;
  /**
   * Take one of them back — see the section for when it resolves. The page's
   * one withdraw write, handed in finished so a preview scene can make it inert.
   */
  onWithdrawOwnRequest: (requestId: string) => Promise<void>;
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
    // Reserved like My SOG and Invoicing: this page usually fits the window
    // while they usually do not, so without it every move between them shifts
    // the page sideways by a scrollbar's width.
    <div className="mx-auto max-w-5xl space-y-10 pb-24" data-reserve-scroll-gutter>
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

      {/* Drawn only while there is something in it: no heading and no
          all-clear line for a gedu who has asked for nothing. */}
      {ownRequests !== null && ownRequests.length > 0 && (
        <section
          aria-labelledby="substitution-own-requests-heading"
          className="space-y-4"
        >
          <h2
            id="substitution-own-requests-heading"
            className="text-xl font-semibold"
          >
            {t("ownRequestsHeading")}
          </h2>
          <GeduOwnSubstitutionRequestsSection
            rows={ownRequests}
            onWithdraw={onWithdrawOwnRequest}
          />
        </section>
      )}

      {/* Withheld whole for an account that may substitute for nothing —
          heading included, because a heading over a queue this gedu is not in
          is a section that can only ever be empty. */}
      {pool !== null && (
        <section
          aria-labelledby="substitution-pool-heading"
          className="space-y-4"
        >
          {/* The note travels with the heading rather than the pool's own
              body: it says what the queue is filtered by, which is true
              whether or not the queue has anything in it, and is what makes
              an empty queue legible to a gedu whose settings are thin. */}
          <div className="space-y-1">
            <h2 id="substitution-pool-heading" className="text-xl font-semibold">
              {t("poolHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.rich("poolRequirementsNote", {
                link: (chunks) => (
                  <Link href={ROUTES.settings} className="text-act hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
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

"use client";

import { useTranslations } from "next-intl";
import type {
  AdminSubstitutionsData,
  SeatSubstituteDraft,
  SubstitutedSession,
} from "./admin-substitutions-data";
import { SubstitutedSessionRow } from "./substituted-session-row";
import { SubstitutionDayList } from "./substitution-day-list";
import { SubstitutionRequestsPanel } from "./substitution-requests-panel";

/**
 * `/admin/substitutions` — the office's staffing queue, and below it the
 * upcoming sessions that already have a substitute.
 *
 * **Two sections, one document.** The second is the admin's counterpart to the
 * gedu page's "You're substituting": where an admin checks whom they approved,
 * and whom to tell. An approval moves a session from the first to the second in
 * the same refetch.
 *
 * **One body, two shells.** The live route wraps it in a data shell that reads
 * the document and owns the two writes — approving an offer, and seating
 * somebody who did not offer; the preview scene wraps it in fixtures and local
 * stand-ins for both. Neither owns a layout, which is what keeps the scene
 * from becoming a second version of this page.
 *
 * **The column is narrower than the page.** An admin surface may use its width,
 * and this one is a stack of rows an eye reads left to right — at a monitor's
 * full width a row's name and its offers would end up a hand apart. So the
 * content takes a reading measure and centres, which is what the other
 * single-column admin pages do.
 *
 * **The zone abbreviation belongs to the page, not to a row.** Every clock face
 * here is the viewer's, and stating that once in the sub-line is the disclosure
 * the date-and-time rule asks for — repeating it on every row would be the same
 * sentence a dozen times. It is absent entirely when nothing converted, which
 * is the ordinary Helsinki-reads-Helsinki case.
 */
export function AdminSubstitutionsPageBody({
  data,
  onApproveOffer,
  onSeatSubstitute,
}: {
  data: AdminSubstitutionsData;
  /**
   * Seat the gedu behind one offer. Resolves once the write landed *and* the
   * refetched document has dropped the request; rejects if it did not.
   */
  onApproveOffer: (offerId: string) => Promise<void>;
  /** Seat a gedu who did not offer. Resolves and rejects on the same terms. */
  onSeatSubstitute: (draft: SeatSubstituteDraft) => Promise<void>;
}) {
  const t = useTranslations("admin.substitutions");

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {data.timeZoneAbbrev === null
            ? t("description")
            : t("descriptionWithZone", { zone: data.timeZoneAbbrev })}
        </p>
      </div>

      <SubstitutionRequestsPanel
        requests={data.open}
        now={data.now}
        onApproveOffer={onApproveOffer}
        onSeatSubstitute={onSeatSubstitute}
      />

      <SubstitutedSessionsSection sessions={data.substituted} now={data.now} />
    </div>
  );
}

/**
 * The sessions that already have a substitute: a heading with a count over the
 * day list, or a line saying there are none — the open queue's own shape, so
 * the two sections read as a pair.
 */
function SubstitutedSessionsSection({
  sessions,
  now,
}: {
  sessions: readonly SubstitutedSession[];
  now: Date;
}) {
  const t = useTranslations("admin.substitutions");

  return (
    <section className="space-y-3">
      <h2 className="flex items-baseline gap-2 text-xl font-semibold">
        {t("substitutedLabel")}
        {sessions.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            {sessions.length}
          </span>
        )}
      </h2>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("substitutedEmpty")}</p>
      ) : (
        <SubstitutionDayList
          requests={sessions}
          label={t("substitutedLabel")}
          renderRequest={(session) => (
            <SubstitutedSessionRow session={session} now={now} />
          )}
        />
      )}
    </section>
  );
}

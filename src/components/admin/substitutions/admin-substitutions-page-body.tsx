"use client";

import { useTranslations } from "next-intl";
import type { AdminSubstitutionsData } from "./admin-substitutions-data";
import { ResolvedSubstitutionsPanel } from "./resolved-substitutions-panel";
import { SubstitutionRequestsPanel } from "./substitution-requests-panel";

/**
 * `/admin/substitutions` — the office's staffing queue, and the fortnight it
 * has already settled.
 *
 * **One body, two shells.** The live route wraps it in a data shell that reads
 * the document and owns the approval; the preview scene wraps it in fixtures
 * and a local approval. Neither owns a layout, which is what keeps the scene
 * from becoming a second version of this page.
 *
 * **Two panels, in the order the questions get asked.** What needs staffing
 * comes first because it is the only half anybody can act on; what has already
 * been settled comes second because it is a record consulted after the fact.
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
}: {
  data: AdminSubstitutionsData;
  /**
   * Seat the gedu behind one offer. Resolves once the write landed *and* the
   * refetched document has dropped the request; rejects if it did not.
   */
  onApproveOffer: (offerId: string) => Promise<void>;
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
      />

      <ResolvedSubstitutionsPanel substitutions={data.recent} />
    </div>
  );
}

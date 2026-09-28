import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduSubstitutionsPage } from "@/components/gedu/GeduSubstitutionsPage";
import {
  getInitialAssignmentRows,
  getInitialAssignmentSummaries,
  getInitialSubstitutionRequests,
  getIsCertified,
} from "../gedu-page-reads";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduSubstitutions") };
}

/**
 * `/gedu/substitutions` — the sessions that need somebody, and the ones this
 * gedu has taken.
 *
 * A data shell and nothing else: prefetch the three reads the body draws from
 * and hand them over. The proxy has already gated the `/gedu` prefix to the gedu
 * role, so nothing here re-checks who is asking.
 *
 * The pool read is made after certification resolves rather than beside it,
 * because whether to ask at all depends on the answer — an uncertified gedu may
 * substitute for nothing, and a read for a section nobody will see is a read
 * nobody wanted.
 */
export default async function GeduSubstitutionsRoute() {
  const [initialRows, initialSummaries, certified] = await Promise.all([
    getInitialAssignmentRows(),
    getInitialAssignmentSummaries(),
    getIsCertified(),
  ]);

  const initialSubstitutionRequests =
    await getInitialSubstitutionRequests(certified);

  return (
    <GeduSubstitutionsPage
      initialRows={initialRows}
      initialSummaries={initialSummaries}
      initialSubstitutionRequests={initialSubstitutionRequests}
      certified={certified}
    />
  );
}

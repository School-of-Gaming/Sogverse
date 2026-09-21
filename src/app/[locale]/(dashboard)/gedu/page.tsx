import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduDashboardPage } from "@/components/gedu/GeduDashboardPage";
import {
  GEDU_CONTRACT_CURRENT_VERSION,
  geduContractBaseVersion,
} from "@/components/gedu/contract/documents";
import { createClient } from "@/lib/supabase/server";
// Imported from the service module rather than the package index because that
// index re-exports `"use client"` query hooks, which a server component would
// pull in as client references.
import { GeduContractService } from "@/services/gedu/gedu-contract.service";
import { getGeduCriminalRecordCheck } from "@/services/gedu/gedu-profiles.service";
import {
  getInitialAssignmentRows,
  getInitialAssignmentSummaries,
  getIsCertified,
} from "./gedu-page-reads";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard") };
}

/**
 * Has this gedu accepted the contract version in force? Read here rather than
 * from the browser because the notice it decides sits above every section of
 * the page: an answer arriving after the first paint would push the whole
 * dashboard down under a reader who had already started on it.
 *
 * **Fails toward showing the notice.** The two ways to be wrong are not
 * symmetrical: a signed gedu shown the band clicks through and is told plainly
 * that they have already signed, while an unsigned one shown nothing never
 * learns that anything is owed. The contract page is the authority in both
 * cases, and it reads its own answer.
 *
 * The comparison is between base versions. A stored version carries the language
 * of the text that was signed, and the languages of one version are the same
 * agreement — so a gedu who signed the Finnish text and reads the app in English
 * has nothing owed, and must not meet a band saying otherwise.
 */
async function getHasAcceptedContract(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    const acceptances = await new GeduContractService(supabase).getAcceptances(
      userId,
    );
    return acceptances.some(
      (row) =>
        geduContractBaseVersion(row.contract_version) ===
        GEDU_CONTRACT_CURRENT_VERSION,
    );
  } catch {
    return false;
  }
}

/**
 * Has an admin recorded seeing this gedu's criminal record extract? Read here
 * rather than from the browser for the same reason the contract standing is:
 * the band it decides sits above every section of the page.
 *
 * **Fails toward showing the band**, the same asymmetry the contract read
 * takes. A gedu who has already presented an extract and is shown the band
 * clicks through and reads that it is recorded; one who has not and is shown
 * nothing never learns that anything is owed. The contract page is the
 * authority in both cases, and it reads its own answer.
 */
async function getHasCriminalRecordCheck(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    return (await getGeduCriminalRecordCheck(supabase, userId)).passed;
  } catch {
    return false;
  }
}

export default async function GeduDashboardRoute() {
  const [
    initialRows,
    initialSummaries,
    certified,
    contractAccepted,
    criminalRecordCheckPassed,
  ] = await Promise.all([
    getInitialAssignmentRows(),
    getInitialAssignmentSummaries(),
    getIsCertified(),
    getHasAcceptedContract(),
    getHasCriminalRecordCheck(),
  ]);

  return (
    <GeduDashboardPage
      initialRows={initialRows}
      initialSummaries={initialSummaries}
      certified={certified}
      contractAccepted={contractAccepted}
      criminalRecordCheckPassed={criminalRecordCheckPassed}
    />
  );
}

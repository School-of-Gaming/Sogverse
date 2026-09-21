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
import {
  getGeduCriminalRecordCheck,
  isGeduCertified,
} from "@/services/gedu/gedu-profiles.service";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import {
  GeduSessionsService,
  type GeduAssignmentSummary,
} from "@/services/gedu-sessions";
// The service class rather than the package index, for the same reason the
// contract service is imported directly above: that index re-exports "use
// client" query hooks.
import { SessionSubstitutionService } from "@/services/session-substitution/session-substitution.service";
import type { OpenSubstitutionRequest } from "@/services/session-substitution/session-substitution.contracts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard") };
}

/**
 * Server-prefetch the assignment rows so the cards paint on first frame.
 * Errors fall back to an empty list — the body will render its own empty-state
 * copy, which is the right read in both the truly-empty and could-not-load
 * cases (the user can refresh).
 *
 * TODO: distinguish "no assignments" from "load failed" in the UI. Today
 * a Supabase blip during the prefetch is indistinguishable from a real
 * empty state (the client-side refetch should self-heal in practice).
 * If we ever see this fire in the wild, render a "couldn't load — try
 * refreshing" surface instead of the empty-state copy.
 */
async function getInitialAssignmentRows(): Promise<MyAssignedProductSessionRow[]> {
  try {
    const supabase = await createClient();
    const service = new AssignmentsService(supabase);
    return await service.getMyAssignedProducts();
  } catch {
    return [];
  }
}

/**
 * Prefetch the per-assignment summaries — group name, group size, site, and
 * the outstanding-write-up count each card's badge shows.
 *
 * **Failure answers `null`, not an empty list**, and the difference matters
 * here in a way it does not for the rows above: an empty summary list is a
 * perfectly plausible real answer (a gedu with no assignments), and taking it
 * on trust after an error would render every card with no group name and a zero
 * badge — a wrong number on the one thing this page exists to surface. `null`
 * tells the client to ask again, and to show its skeleton meanwhile.
 */
async function getInitialAssignmentSummaries(): Promise<
  GeduAssignmentSummary[] | null
> {
  try {
    const supabase = await createClient();
    const service = new GeduSessionsService(supabase);
    return await service.getMyAssignmentSummaries();
  } catch {
    return null;
  }
}

/**
 * Prefetch the substitution pool — every open request this gedu could take.
 *
 * **Asked only of a certified gedu**, because certification is what gates
 * offering and holding a substitution server-side: an uncertified caller may substitution
 * nothing, the section is withheld from them whole, and a read made for a page
 * nobody will see is a read nobody wanted.
 *
 * **Failure answers `null`, not an empty list**, the same distinction the
 * summaries above draw: an empty pool is a real and common answer, and rendering
 * "nothing needs a substitute" on the strength of a Supabase blip would tell a gedu the
 * queue is clear when it is not. `null` sends the client to ask again.
 *
 * It is prefetched rather than left client-only because the existing shell
 * already makes four server reads for this page in one `Promise.all` and hands
 * the answers down as props — a fifth costs nothing and keeps the section from
 * being the one thing on the dashboard that lands a round trip late.
 */
async function getInitialSubstitutionRequests(
  certified: boolean,
): Promise<OpenSubstitutionRequest[] | null> {
  if (!certified) return null;
  try {
    const supabase = await createClient();
    return await new SessionSubstitutionService(supabase).getOpenRequests();
  } catch {
    return null;
  }
}

/**
 * Has an admin certified this gedu? Creating an instant voice room is gated on
 * it server-side (the create route 403s an uncertified gedu); we mirror that gate
 * in the UI so the user sees a clear "awaiting approval" notice instead of a
 * button that fails. Fail-closed: any lookup error hides the card (the worst
 * case is a certified gedu briefly not seeing it, which a refresh fixes — better
 * than showing a button that 403s).
 */
async function getIsCertified(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    return await isGeduCertified(supabase, userId);
  } catch {
    return false;
  }
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

  // Sequential with the four above rather than beside them: whether to ask for
  // the pool at all depends on certification, and asking for a page nobody will
  // see is a read nobody wanted.
  const initialSubstitutionRequests = await getInitialSubstitutionRequests(certified);

  return (
    <GeduDashboardPage
      initialRows={initialRows}
      initialSummaries={initialSummaries}
      initialSubstitutionRequests={initialSubstitutionRequests}
      certified={certified}
      contractAccepted={contractAccepted}
      criminalRecordCheckPassed={criminalRecordCheckPassed}
    />
  );
}

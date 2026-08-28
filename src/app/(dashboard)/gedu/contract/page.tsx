import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { GeduContractPage } from "@/components/gedu/contract/GeduContractPage";
import {
  GEDU_CONTRACT_CURRENT_VERSION,
  GEDU_CONTRACT_FALLBACK_LANGUAGE,
  geduContractLanguageForLocale,
  getGeduContractDocument,
} from "@/components/gedu/contract/documents";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
// Imported from the service module rather than the package index because that
// index re-exports `"use client"` query hooks, which a server component would
// pull in as client references.
import { GeduContractService } from "@/services/gedu/gedu-contract.service";
import {
  getGeduCriminalRecordCheck,
  type GeduCriminalRecordCheck,
} from "@/services/gedu/gedu-profiles.service";
import type { AppSupabaseClient, GeduContractAcceptance } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduContract") };
}

/**
 * The signed-in gedu's acceptances, prefetched so the page paints its panel —
 * the sign prompt or the record — on the first frame.
 *
 * **Failure answers `null`, not an empty list.** An empty list is a perfectly
 * ordinary real answer (a gedu who has not signed yet), and taking it on trust
 * after an error would show somebody who has already signed a prompt to sign
 * again. `null` tells the client to ask again and to show no panel meanwhile.
 */
async function getInitialAcceptances(
  supabase: AppSupabaseClient,
  geduId: string,
): Promise<GeduContractAcceptance[] | null> {
  try {
    return await new GeduContractService(supabase).getAcceptances(geduId);
  } catch {
    return null;
  }
}

/**
 * Where this gedu stands on the criminal record check, for the section that
 * explains it above the terms.
 *
 * **Failure answers `null`, and `null` means *unknown*.** The section's
 * explanation of how the process works is printed either way — it is true of
 * everybody — but the standing line is a claim about this reader, and telling
 * somebody who presented an extract last month that they still owe one is worse
 * than telling them nothing. This is the opposite posture to the dashboard's
 * next-step band, which fails toward showing itself; the difference is that a
 * band is a nudge and a status line is an assertion.
 */
async function getCriminalRecordCheck(
  supabase: AppSupabaseClient,
  geduId: string,
): Promise<GeduCriminalRecordCheck | null> {
  try {
    return await getGeduCriminalRecordCheck(supabase, geduId);
  } catch {
    return null;
  }
}

/**
 * `/gedu/contract` — the terms a Game Educator works under, the place they are
 * accepted, and the explanation of the criminal record extract that has to be
 * presented alongside them.
 *
 * A data shell and nothing else: resolve the signed-in gedu, resolve the
 * document in force in the language this reader reads, prefetch the acceptances,
 * hand all three to the client body. The proxy has already gated this path to
 * the gedu role, so a missing claim means no session at all rather than the
 * wrong one.
 *
 * **Which text is shown follows the locale, and there is no toggle.** The
 * languages of a version are equally binding, so there is no "original" to offer
 * beside a translation — there is the agreement, in the words this reader is
 * already reading the product in. What gets recorded is the text that was on
 * screen, which the client body encodes into the version it sends.
 */
export default async function GeduContractRoute() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect(ROUTES.login);

  // A locale with no contract text of its own resolves to English, and English
  // itself may not have been transcribed for an older version — so the lookup
  // falls back to the language every version is guaranteed to exist in rather
  // than 404ing a reader out of terms that do exist.
  const locale = await getLocale();
  const contract =
    getGeduContractDocument(
      GEDU_CONTRACT_CURRENT_VERSION,
      geduContractLanguageForLocale(locale),
    ) ??
    getGeduContractDocument(
      GEDU_CONTRACT_CURRENT_VERSION,
      GEDU_CONTRACT_FALLBACK_LANGUAGE,
    );
  // Not even the fallback: the constant and the registry ship together, so this
  // means the two were changed apart, and a 404 is the honest answer rather than
  // a page with no terms on it.
  if (!contract) notFound();

  const [initialAcceptances, criminalRecordCheck] = await Promise.all([
    getInitialAcceptances(supabase, userId),
    getCriminalRecordCheck(supabase, userId),
  ]);

  return (
    <GeduContractPage
      geduId={userId}
      contract={contract}
      initialAcceptances={initialAcceptances}
      criminalRecordCheck={criminalRecordCheck}
    />
  );
}

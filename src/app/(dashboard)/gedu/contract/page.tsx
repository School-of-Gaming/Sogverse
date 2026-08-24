import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GeduContractPage } from "@/components/gedu/contract/GeduContractPage";
import {
  GEDU_CONTRACT_CURRENT_VERSION,
  getGeduContractDocument,
} from "@/components/gedu/contract/documents";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
// Imported from the service module rather than the package index because that
// index re-exports `"use client"` query hooks, which a server component would
// pull in as client references.
import { GeduContractService } from "@/services/gedu/gedu-contract.service";
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
 * `/gedu/contract` — the terms a Game Educator works under, and the place they
 * are accepted.
 *
 * A data shell and nothing else: resolve the signed-in gedu, resolve the
 * document in force, prefetch the acceptances, hand all three to the client
 * body. The proxy has already gated this path to the gedu role, so a missing
 * claim means no session at all rather than the wrong one.
 */
export default async function GeduContractRoute() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect(ROUTES.login);

  // The current version always has a transcribed document — the constant and
  // the registry ship together — so a miss means the two were changed apart,
  // and a 404 is the honest answer rather than a page with no terms on it.
  const contract = getGeduContractDocument(GEDU_CONTRACT_CURRENT_VERSION);
  if (!contract) notFound();

  const initialAcceptances = await getInitialAcceptances(supabase, userId);

  return (
    <GeduContractPage
      geduId={userId}
      contract={contract}
      initialAcceptances={initialAcceptances}
    />
  );
}

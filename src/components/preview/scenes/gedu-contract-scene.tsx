"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { useLocale } from "next-intl";
import { GeduContractPageBody } from "@/components/gedu/contract/gedu-contract-page-body";
import {
  GEDU_CONTRACT_CURRENT_VERSION,
  GEDU_CONTRACT_FALLBACK_LANGUAGE,
  geduContractLanguageForLocale,
  getGeduContractDocument,
} from "@/components/gedu/contract/documents";
import {
  buildGeduContractFixture,
  type GeduContractScenario,
} from "@/components/gedu/contract/mock-contract-fixtures";
import { useNow } from "@/providers";

/**
 * The contract page as a gedu meets it, over fixtures.
 *
 * **The document is the real one**, not a stand-in: the whole point of looking
 * at this page is how a long verbatim legal text sits under the page chrome and
 * above the acceptance panel, which a paragraph of lorem cannot show.
 *
 * It is also picked the way the live route picks it — from the viewer's locale,
 * with the same fallback — so an admin reading the app in Finnish sees the
 * Finnish text here and an admin reading it in anything else sees the English
 * one, which is exactly what the gedu in that locale would meet. The scenario
 * axis is deliberately not the language: the two texts are the same page in
 * different words, and a second link per language would be two scenarios that
 * cannot be compared side by side anyway.
 *
 * The signing dialog opens and its two ceremonial steps work, because putting a
 * name and a date on a line is pure UI over local state. Accepting is a write,
 * so it is inert — the button renders its real enabled state and does nothing,
 * the same shape the dashboard scene's two tool panels take.
 *
 * The fixture is built once from the first `useNow()` value and held, so the
 * acceptance date does not creep while somebody is looking at it.
 */
export function GeduContractScene({
  scenario,
}: {
  scenario: GeduContractScenario;
}) {
  const now = useNow();
  const locale = useLocale();
  const [fixture] = useState(() => buildGeduContractFixture(now, scenario));
  const contract =
    getGeduContractDocument(
      GEDU_CONTRACT_CURRENT_VERSION,
      geduContractLanguageForLocale(locale),
    ) ??
    getGeduContractDocument(
      GEDU_CONTRACT_CURRENT_VERSION,
      GEDU_CONTRACT_FALLBACK_LANGUAGE,
    );
  // Same answer the live route gives: the current version always has a document
  // in the fallback language, so a miss means the constant and the registry
  // drifted apart.
  if (!contract) notFound();

  return (
    <GeduContractPageBody
      contract={contract}
      acceptance={fixture.acceptance}
      signerName={fixture.signerName}
      committing={false}
      acceptFailed={false}
      onSignOpen={noop}
      onAccept={noop}
    />
  );
}

function noop() {}

import type { NamespaceLoaders } from "../namespace-loader";

/** The `sessionFacts` namespace in every locale (`../namespace-loader.ts`). */
export const sessionFactsMessages: NamespaceLoaders<"sessionFacts"> = {
  en: () => import("../../../messages/en/sessionFacts.json"),
  fi: () => import("../../../messages/fi/sessionFacts.json"),
  sv: () => import("../../../messages/sv/sessionFacts.json"),
  fr: () => import("../../../messages/fr/sessionFacts.json"),
  tlh: () => import("../../../messages/tlh/sessionFacts.json"),
};

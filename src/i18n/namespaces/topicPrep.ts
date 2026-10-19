import type { NamespaceLoaders } from "../namespace-loader";

/** The `topicPrep` namespace in every locale (`../namespace-loader.ts`). */
export const topicPrepMessages: NamespaceLoaders<"topicPrep"> = {
  en: () => import("../../../messages/en/topicPrep.json"),
  fi: () => import("../../../messages/fi/topicPrep.json"),
  sv: () => import("../../../messages/sv/topicPrep.json"),
  fr: () => import("../../../messages/fr/topicPrep.json"),
  tlh: () => import("../../../messages/tlh/topicPrep.json"),
};

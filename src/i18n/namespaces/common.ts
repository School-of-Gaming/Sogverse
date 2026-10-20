import type { NamespaceLoaders } from "../namespace-loader";

/** The `common` namespace in every locale (`../namespace-loader.ts`). */
export const commonMessages: NamespaceLoaders<"common"> = {
  en: () => import("../../../messages/en/common.json"),
  fi: () => import("../../../messages/fi/common.json"),
  sv: () => import("../../../messages/sv/common.json"),
  fr: () => import("../../../messages/fr/common.json"),
  tlh: () => import("../../../messages/tlh/common.json"),
};

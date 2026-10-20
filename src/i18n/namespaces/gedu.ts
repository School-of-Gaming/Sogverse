import type { NamespaceLoaders } from "../namespace-loader";

/** The `gedu` namespace in every locale (`../namespace-loader.ts`). */
export const geduMessages: NamespaceLoaders<"gedu"> = {
  en: () => import("../../../messages/en/gedu.json"),
  fi: () => import("../../../messages/fi/gedu.json"),
  sv: () => import("../../../messages/sv/gedu.json"),
  fr: () => import("../../../messages/fr/gedu.json"),
  tlh: () => import("../../../messages/tlh/gedu.json"),
};

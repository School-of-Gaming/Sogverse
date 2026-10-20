import type { NamespaceLoaders } from "../namespace-loader";

/** The `email` namespace in every locale (`../namespace-loader.ts`). */
export const emailMessages: NamespaceLoaders<"email"> = {
  en: () => import("../../../messages/en/email.json"),
  fi: () => import("../../../messages/fi/email.json"),
  sv: () => import("../../../messages/sv/email.json"),
  fr: () => import("../../../messages/fr/email.json"),
  tlh: () => import("../../../messages/tlh/email.json"),
};

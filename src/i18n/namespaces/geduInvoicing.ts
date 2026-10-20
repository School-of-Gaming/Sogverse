import type { NamespaceLoaders } from "../namespace-loader";

/** The `geduInvoicing` namespace in every locale (`../namespace-loader.ts`). */
export const geduInvoicingMessages: NamespaceLoaders<"geduInvoicing"> = {
  en: () => import("../../../messages/en/geduInvoicing.json"),
  fi: () => import("../../../messages/fi/geduInvoicing.json"),
  sv: () => import("../../../messages/sv/geduInvoicing.json"),
  fr: () => import("../../../messages/fr/geduInvoicing.json"),
  tlh: () => import("../../../messages/tlh/geduInvoicing.json"),
};

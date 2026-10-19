import type { NamespaceLoaders } from "../namespace-loader";

/**
 * The `metadata` namespace, in English only: its one caller outside the request
 * config, `/llms.txt`, is English by design. A caller needing another locale
 * adds it here (`../namespace-loader.ts`).
 */
export const metadataMessages: NamespaceLoaders<"metadata", "en"> = {
  en: () => import("../../../messages/en/metadata.json"),
};

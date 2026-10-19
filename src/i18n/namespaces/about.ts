import type { NamespaceLoaders } from "../namespace-loader";

/**
 * The `about` namespace, in English only: its one caller, `/llms.txt`, is
 * English by design. A caller needing another locale adds it here (`../namespace-loader.ts`).
 */
export const aboutMessages: NamespaceLoaders<"about", "en"> = {
  en: () => import("../../../messages/en/about.json"),
};

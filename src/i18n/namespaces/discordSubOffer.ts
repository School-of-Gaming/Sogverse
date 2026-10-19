import type { NamespaceLoaders } from "../namespace-loader";

/** The `discordSubOffer` namespace in every locale (`../namespace-loader.ts`). */
export const discordSubOfferMessages: NamespaceLoaders<"discordSubOffer"> = {
  en: () => import("../../../messages/en/discordSubOffer.json"),
  fi: () => import("../../../messages/fi/discordSubOffer.json"),
  sv: () => import("../../../messages/sv/discordSubOffer.json"),
  fr: () => import("../../../messages/fr/discordSubOffer.json"),
  tlh: () => import("../../../messages/tlh/discordSubOffer.json"),
};

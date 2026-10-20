import type { NamespaceLoaders } from "../namespace-loader";

/** The `discordSub` namespace in every locale (`../namespace-loader.ts`). */
export const discordSubMessages: NamespaceLoaders<"discordSub"> = {
  en: () => import("../../../messages/en/discordSub.json"),
  fi: () => import("../../../messages/fi/discordSub.json"),
  sv: () => import("../../../messages/sv/discordSub.json"),
  fr: () => import("../../../messages/fr/discordSub.json"),
  tlh: () => import("../../../messages/tlh/discordSub.json"),
};

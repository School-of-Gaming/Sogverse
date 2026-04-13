import type { SupportedLanguage } from "@/lib/constants/language-preference";
import type en from "../../messages/en.json";

export type Messages = typeof en;

/**
 * Static import map for translation files. The bundler validates these paths
 * at build time — if a file is moved or deleted, the build fails immediately
 * instead of failing at runtime.
 *
 * When adding a new language, add its import here.
 */
const messageLoaders: Record<SupportedLanguage, () => Promise<{ default: Messages }>> = {
  en: () => import("../../messages/en.json"),
  fi: () => import("../../messages/fi.json"),
  sv: () => import("../../messages/sv.json"),
  tlh: () => import("../../messages/tlh.json"),
};

export async function loadMessages(locale: SupportedLanguage): Promise<Messages> {
  const mod = await messageLoaders[locale]();
  return mod.default;
}

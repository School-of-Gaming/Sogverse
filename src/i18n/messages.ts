import type { SupportedLocale } from "@/lib/constants/locales";
import type en from "../../messages/en.json";
import type tlh from "../../messages/tlh.json";

export type Messages = typeof en;

/**
 * Klingon laid over English, so the keys `tlh` deliberately leaves out resolve
 * to the English text at runtime.
 *
 * `tlh` omits the legal surface — the policy and terms namespaces, the
 * attributions credit, those pages' metadata titles, and every label that names
 * one of the documents. Binding text and licence conditions are not a place for
 * an in-character rendering, and *omitting* the keys rather than copying the
 * English in verbatim is what keeps English their single source of truth: a
 * copy has to be re-mirrored by hand every time the English is edited, and
 * nothing would fail if it were not.
 *
 * Spread by hand rather than merged generically, and that is the point. A
 * generic deep merge has to assert its own return type, and it would absorb a
 * *new* hole in silence; this returns `Messages` under the compiler's eye, so a
 * namespace that starts omitting a key without a matching line here fails the
 * build and names itself. Three subtrees have holes today — everything else
 * `tlh` carries whole, and the outer spread takes it as-is.
 *
 * next-intl 4.x ships no merge helper of its own; its docs point at a general
 * deep-merge package, which is the shape this replaces.
 */
function withEnglishFallback(english: Messages, klingon: typeof tlh): Messages {
  return {
    ...english,
    ...klingon,
    footer: { ...english.footer, ...klingon.footer },
    metadata: {
      ...english.metadata,
      ...klingon.metadata,
      pages: { ...english.metadata.pages, ...klingon.metadata.pages },
    },
    roblox: {
      ...english.roblox,
      ...klingon.roblox,
      legal: { ...english.roblox.legal, ...klingon.roblox.legal },
    },
  };
}

/**
 * Static import map for translation files. The bundler validates these paths
 * at build time — if a file is moved or deleted, the build fails immediately
 * instead of failing at runtime.
 *
 * When adding a new locale, add its import here.
 *
 * Every locale but Klingon is loaded as-is and typed as a complete catalog, so
 * a missing key there is a build failure and stays one. **The English fallback
 * is scoped to `tlh` alone** — extending it to another locale would turn that
 * locale's missing keys into English text instead of a failed build, which is
 * the opposite of what we want everywhere the translation is meant seriously.
 */
const messageLoaders: Record<SupportedLocale, () => Promise<{ default: Messages }>> = {
  en: () => import("../../messages/en.json"),
  fi: () => import("../../messages/fi.json"),
  sv: () => import("../../messages/sv.json"),
  fr: () => import("../../messages/fr.json"),
  tlh: async () => {
    const [english, klingon] = await Promise.all([
      import("../../messages/en.json"),
      import("../../messages/tlh.json"),
    ]);
    return { default: withEnglishFallback(english.default, klingon.default) };
  },
};

export async function loadMessages(locale: SupportedLocale): Promise<Messages> {
  const mod = await messageLoaders[locale]();
  return mod.default;
}

import type { SupportedLocale } from "@/lib/constants/locales";
import type { Messages } from "./messages";

/**
 * One namespace's file in each locale a caller loads it in, as a static import
 * per locale — the table each module under `namespaces/` exports, one module
 * per namespace, so a caller's import graph names exactly the namespaces it
 * reads (`src/i18n/CLAUDE.md`).
 *
 * The value type is the English namespace, so every locale's file is checked
 * against it in full. **A table that carries `tlh` therefore assumes `tlh`
 * holds that namespace whole**: the English fallback lives only in the whole
 * catalog's loader, and nothing lays Klingon over English here. A namespace
 * `tlh` doesn't carry whole fails type-check in a table listing `tlh`; such a
 * table is either English-only, as its callers allow, or has to merge over
 * English itself.
 */
export type NamespaceLoaders<
  N extends keyof Messages,
  L extends SupportedLocale = SupportedLocale,
> = Readonly<Record<L, () => Promise<{ default: Messages[N] }>>>;

/**
 * Loads one namespace in one locale from its table. A locale the table does
 * not carry is a type error, never a runtime miss.
 */
export async function loadNamespace<T, L extends SupportedLocale>(
  loaders: Readonly<Record<L, () => Promise<{ default: T }>>>,
  locale: NoInfer<L>,
): Promise<T> {
  const mod = await loaders[locale]();
  return mod.default;
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { UsersService } from "./users.service";
import type { SpokenLanguage } from "@/types";

/**
 * Server-prefetch the spoken-language reference set for a page's Server
 * Component, so the form's language checkboxes paint complete on the first
 * frame instead of popping in after a client fetch (CLAUDE.md layout-shift
 * rule). Callers pass the result as `initialData` to `useSpokenLanguages`,
 * which still refetches on mount.
 *
 * `spoken_languages` is anon-readable reference data, so this works before any
 * auth session exists (e.g. the invite-only setup-account page). On any failure
 * it returns `[]` and the page still renders — the client hook refetches.
 *
 * Shop deliberately does NOT use this; it batches languages with products and
 * counts under one client and one try/catch (see `shop/page.tsx`).
 */
export async function prefetchSpokenLanguages(): Promise<SpokenLanguage[]> {
  try {
    const supabase = await createClient();
    return await new UsersService(supabase).getSpokenLanguages();
  } catch {
    return [];
  }
}

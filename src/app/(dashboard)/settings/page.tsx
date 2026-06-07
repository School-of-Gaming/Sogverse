import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createClient } from "@/lib/supabase/server";
import { UsersService } from "@/services/users";
import type { SpokenLanguage } from "@/types";

/**
 * Server-prefetch the spoken-language reference set so the profile form's
 * language checkboxes paint complete on the first frame instead of popping in
 * after a client fetch (CLAUDE.md layout-shift rule). The set seeds React Query
 * via `initialData`; the hook still refetches on mount. `spoken_languages` is
 * anon-readable reference data, so no auth scoping is needed. On failure the
 * page still renders and the client hook refetches.
 */
async function getSpokenLanguages(): Promise<SpokenLanguage[]> {
  try {
    const supabase = await createClient();
    return await new UsersService(supabase).getSpokenLanguages();
  } catch {
    return [];
  }
}

export default async function SettingsPage() {
  const spokenLanguages = await getSpokenLanguages();
  return <SettingsSectionContent initialSpokenLanguages={spokenLanguages} />;
}

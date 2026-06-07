import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { prefetchSpokenLanguages } from "@/services/users/users.prefetch";

export default async function SettingsPage() {
  const spokenLanguages = await prefetchSpokenLanguages();
  return <SettingsSectionContent initialSpokenLanguages={spokenLanguages} />;
}

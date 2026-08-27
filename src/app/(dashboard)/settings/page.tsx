import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
// Imported from the service module rather than the package index because that
// index re-exports `"use client"` query hooks, which a server component would
// pull in as client references.
import { GeduContractService } from "@/services/gedu/gedu-contract.service";
import type { GeduContractAcceptance } from "@/types";

/**
 * The signed-in gedu's contract acceptances, prefetched so the settings card is
 * born in its real state — signed, or not — rather than growing into it a
 * hydration after the page is up.
 *
 * Read with the viewer's **own** RLS-scoped client, never the admin one: the
 * `gedus_read_own_contract_acceptances` policy already scopes a gedu to their
 * own rows, so Postgres is the access gate and there is no service-role bypass
 * on this path. It is the same select the client hook would fire, one network
 * hop earlier, so both paths share one shape and the seed cannot disagree with
 * the refetch.
 *
 * **Failure answers `null`, not an empty list** — the same distinction the
 * contract page and the parent dashboard draw. An empty list is a perfectly
 * ordinary real answer (a gedu who has not signed yet), so a seed of `[]` after
 * a transient error would tell somebody who has already signed that they have
 * not, and leave it on screen with nothing to correct it. `null` means *do not
 * seed*: the shell passes no `initialData` at all, the hook fetches on mount,
 * and the card shows an empty body until it answers.
 */
async function getInitialGeduContractAcceptances(
  geduId: string,
): Promise<GeduContractAcceptance[] | null> {
  try {
    const supabase = await createClient();
    return await new GeduContractService(supabase).getAcceptances(geduId);
  } catch {
    return null;
  }
}

/**
 * `/settings` — one page for every role, and a data shell in front of it.
 *
 * The body is a client component that reads the viewer's profile from the auth
 * provider, so almost nothing here needs resolving server-side. The exception is
 * the gedu contract card: it is the one card on the page whose body a read
 * decides, and reading it here is what lets it paint at its final height.
 *
 * **Only a gedu is read for.** The card is not rendered for anyone else, so a
 * query for anyone else would be a round trip for a component that will not
 * exist — the role is resolved from the `getClaims()`-verified profile, never
 * from request input.
 */
export default async function SettingsPage() {
  const userWithProfile = await getUserWithProfile();
  const initialGeduContractAcceptances =
    userWithProfile?.profile?.role === "gedu"
      ? await getInitialGeduContractAcceptances(userWithProfile.user.id)
      : null;

  return (
    <SettingsSectionContent
      initialGeduContractAcceptances={initialGeduContractAcceptances}
    />
  );
}

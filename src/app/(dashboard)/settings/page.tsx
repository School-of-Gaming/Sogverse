import type { GeduContractSeed } from "@/components/gedu/contract/gedu-contract-settings-card";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { isGamerPhotoConsentGranted } from "@/lib/gamer-photo-consent-answer";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
// Imported from the service module rather than the package index because that
// index re-exports `"use client"` query hooks, which a server component would
// pull in as client references.
import { GeduContractService } from "@/services/gedu/gedu-contract.service";
import type { AppSupabaseClient, GamerSignIn } from "@/types";

/**
 * The signed-in gedu's contract acceptances, and the moment they were read.
 *
 * Read with the viewer's **own** RLS-scoped client, never the admin one: the
 * `gedus_read_own_contract_acceptances` policy already scopes a gedu to their
 * own rows, so Postgres is the access gate and there is no service-role bypass
 * on this path. It is the same select the client hook would fire, one network
 * hop earlier, so both paths share one shape and the seed cannot disagree with
 * the refetch.
 *
 * **A failure is not caught.** It throws, and the page throws with it — see the
 * route below for why this page does not degrade the way its neighbours do. The
 * moment is stamped here, next to the read it describes, so a payload replayed
 * from the router cache is aged rather than taken for fresh.
 */
async function readGeduContractSeed(
  supabase: AppSupabaseClient,
  geduId: string,
): Promise<GeduContractSeed> {
  const acceptances = await new GeduContractService(supabase).getAcceptances(
    geduId,
  );
  return { acceptances, fetchedAt: Date.now() };
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
 * from request input. That also makes the seed's presence the role test the body
 * uses: it exists exactly when this route saw a gedu.
 *
 * **This page renders whole or it fails, which is a deliberate deviation from
 * the parent dashboard's precedent.** That dashboard swallows a failed prefetch
 * and seeds nothing, because its seeds *enrich* a page that is already useful
 * without them and it is the highest-traffic page we have — degrading there
 * keeps a working page working. Nothing of the sort is true here: this page
 * already hard-depends on a server identity read to render at all, it is a
 * low-traffic utility page, and the owner ruled for two-state simplicity over a
 * third state that exists only for an error nobody sees. So the read throws and
 * the page errors like any other server render.
 *
 * The accepted cost, stated plainly: a gedu's settings visit blocks on this read
 * before the first byte.
 */
/**
 * How this gamer signs in, resolved before the first byte.
 *
 * Three things on this page key on it — whether the Email field exists at all,
 * whether the verify line and button do, and whether the password-reset button
 * does — so a value that arrived a round trip after the page would insert a
 * whole field into the middle of a form somebody was already reading. Reading it
 * here is what keeps that from being a shift (root `CLAUDE.md`, "Layout &
 * Scrolling"): the body paints once, in its final shape.
 *
 * **A failed or missing read answers `parent`, and that is the conservative
 * answer rather than a fallback that pretends.** `parent` is the mode that shows
 * no address, no verification state and no password affordance — exactly what
 * every gamer's settings page showed before the modes existed — so the worst
 * this can do is withhold something, never invent a credential.
 */
async function readGamerSignIn(
  supabase: AppSupabaseClient,
  gamerId: string,
): Promise<GamerSignIn> {
  const { data } = await supabase
    .from("gamer_profiles")
    .select("sign_in")
    .eq("user_id", gamerId)
    .maybeSingle();
  return data?.sign_in ?? "parent";
}

/**
 * What this child's parent has said about photographs of them, resolved before
 * the first byte.
 *
 * **Read here rather than in the body, and the reason is the sentence's own
 * length.** The card states one of two sentences and they do not wrap to the
 * same number of lines, so a value arriving a round trip after the page would
 * grow the card and push the security card below it down — a shift on data's own
 * schedule. The alternatives were to reserve the taller sentence's height, which
 * leaves a hole under the shorter one at every width and in every locale, or to
 * paint the card late, which is the same shift wearing a different coat. This
 * page already blocks on a server read for exactly this reason one function up,
 * so the body paints once in its final shape and there is nothing to reserve.
 *
 * **A failed or missing read answers `false`, which is not a fallback but the
 * feature's own default.** An absent row means the question was never put to
 * this child's parent, and that renders identically to a stored "no"
 * everywhere: the child stays out of the photographs. So the conservative
 * answer and the honest one are the same answer, and the worst a network blip
 * can do here is tell a child their parent has not said yes — never the
 * reverse.
 */
async function readGamerPhotoConsentGranted(
  supabase: AppSupabaseClient,
  gamerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("gamer_photo_consents")
    .select("gamer_id, consent_type, granted, updated_at")
    .eq("gamer_id", gamerId);
  return isGamerPhotoConsentGranted(data ?? undefined, "lynx_educate");
}

export default async function SettingsPage() {
  const userWithProfile = await getUserWithProfile();

  if (userWithProfile?.profile?.role === "gamer") {
    // The child's own rows, read with the child's own client: the
    // `gamers_read_own_gamer_profile` and `gamers_read_own_photo_consents`
    // policies scope them, so Postgres is the gate and there is no service-role
    // bypass on this path. Both reads go out together — neither decides the
    // other, and a gamer's settings visit already blocks on the first.
    const supabase = await createClient();
    const [gamerSignIn, photoConsentGranted] = await Promise.all([
      readGamerSignIn(supabase, userWithProfile.user.id),
      readGamerPhotoConsentGranted(supabase, userWithProfile.user.id),
    ]);
    return (
      <SettingsSectionContent
        gamerSignIn={gamerSignIn}
        photoConsentGranted={photoConsentGranted}
      />
    );
  }

  if (userWithProfile?.profile?.role !== "gedu") {
    return <SettingsSectionContent />;
  }

  // One client, threaded — the same shape the sibling /gedu/contract route
  // uses. The read helper takes it rather than building a second one.
  const supabase = await createClient();
  const geduContractSeed = await readGeduContractSeed(
    supabase,
    userWithProfile.user.id,
  );

  return <SettingsSectionContent geduContractSeed={geduContractSeed} />;
}

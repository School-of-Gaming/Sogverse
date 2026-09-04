import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { readSessionProvenance } from "@/lib/auth";
import type { SessionProvenance } from "@/lib/session-provenance";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/constants/roles";
import { Header } from "@/components/layout";
import { SelectProfileView } from "@/components/select-profile";
import { resolveFamilyWithAdmin } from "@/services/family/family.server";
import type { FamilyMember } from "@/services/family";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selectProfile");
  // Plain, so it inherits the root layout's "%s | School of Gaming" template.
  // It used to be `absolute`: the template said "%s | Sogverse", and a title
  // that already contains "Sogverse" stuttered against it. The template leads
  // with the brand now, so there is nothing left to skip.
  return { title: t("title") };
}

/**
 * Family profile selector — "Who is entering Sogverse?"
 *
 * Two entry points share this page:
 *   1. Post-sign-in interstitial for parents (set by `ROLE_POST_LOGIN_PATHS`).
 *   2. In-session switcher for parents *and* gamers, reached by clicking the
 *      header avatar — lets a gamer hop to a sibling or back to the parent.
 *
 * Lives at the top of the app tree (not inside any (group)) so it composes
 * its own chrome: the standard `Header` plus a centered main, no footer. It
 * renders the *standard* header deliberately — a simplified picker-only
 * header existed once and drifted out of sync with the real one (an outdated
 * typed mark), and nothing the simplification protected against is real:
 * no route forces a return to this picker, and a locked parent who clicks
 * away is caught by the parent-PIN gate everywhere, which is the actual
 * boundary. Same conclusion the `(voice)` group reached when it retired its
 * own bespoke header.
 *
 * Routing: the proxy already bounces unauthenticated visitors to /login. Here
 * we additionally short-circuit admins/gedus to their own dashboards — the
 * family selector only makes sense for parent/gamer households.
 */
export default async function SelectProfilePage() {
  const userWithProfile = await getUserWithProfile();
  const role = userWithProfile?.profile?.role as UserRole | undefined;

  // The `!userWithProfile` arm is redundant at runtime (a null profile means
  // `role` is undefined, which already fails the role check) but it narrows
  // `userWithProfile` to non-null for the prefetch below.
  if (!userWithProfile || (role !== "customer" && role !== "gamer")) {
    redirect(role ? ROLE_DASHBOARD_PATHS[role] : ROUTES.customer.dashboard);
  }

  // "Continue as me" target: the viewer's own dashboard.
  const selfDashboardPath = ROLE_DASHBOARD_PATHS[role];
  const [resolvedFamily, initialSessionProvenance] = await Promise.all([
    getInitialFamily(userWithProfile.user.id, role),
    getSessionProvenance(),
  ]);

  /**
   * **A seed is a claim that the first frame is right, and it is held for a
   * minute.** React Query treats seeded data as fresh (the client's global
   * `staleTime`), so a seed missing the provenance does not merely paint a
   * pessimistic first frame — it pins one. A gamer would sit in front of tiles
   * that are on screen, named, and out of service for the whole minute, with
   * nothing scheduled to fix them.
   *
   * So the two halves are seeded together or not at all. A customer is the one
   * exception, and not a hedge: their gate is `none` whatever the provenance
   * turns out to be, so there is nothing for the missing half to decide.
   * Everyone else falls back to the honest path — no seed, and the client's own
   * fetch lands the list and the provenance in the same answer.
   */
  const initialFamily =
    initialSessionProvenance !== undefined || role === "customer"
      ? resolvedFamily
      : undefined;

  return (
    <>
      <Header />
      {/* Pull main up under the sticky header so the centering math runs
          against the full viewport, not viewport-minus-header. Same trick
          the home hero uses (`src/app/(public)/page.tsx`) — visual center
          of the body lands at 50vh instead of below the header. Symmetric
          py-12 keeps the centering true; the body content is small enough
          (title + one row of tiles) that it never reaches the header zone. */}
      <main className="-mt-[var(--header-height)] flex min-h-screen items-center justify-center px-4 py-12 sm:py-16">
        <SelectProfileView
          selfDashboardPath={selfDashboardPath}
          initialFamily={initialFamily}
          initialSessionProvenance={initialSessionProvenance}
        />
      </main>
    </>
  );
}

/**
 * Server-prefetch the viewer's family so the selector paints fully populated
 * the instant the page loads — same hydrate-from-prefetch shape as the parent
 * dashboard. Uses the admin client because this page serves gamers too, and a
 * gamer must see siblings that RLS hides (see `resolveFamilyWithAdmin`).
 * Identity comes from the `getClaims()`-verified `getUserWithProfile()` above,
 * never request input.
 *
 * `undefined` on any failure, never `[]`: an empty list is a *claim* that the
 * household is empty, and a seeded claim is held as fresh for a minute rather
 * than corrected by the next fetch. Absence puts the selector on its skeleton
 * and lets the client's own read answer.
 */
async function getInitialFamily(
  userId: string,
  role: "customer" | "gamer",
): Promise<FamilyMember[] | undefined> {
  try {
    return await resolveFamilyWithAdmin(createAdminClient(), userId, role);
  } catch {
    return undefined;
  }
}

/**
 * The provenance of the viewer's own session, seeded beside the list so the
 * tiles paint with their gate already decided.
 *
 * This page serves gamers, and a gamer pays a credential to leave their own
 * account — which one depends on this (`src/services/pin/CLAUDE.md`, Gate B).
 * Unseeded, `useSessionProvenance()` is `null` on the first frame and every tile
 * is correctly but pointlessly out of service until the client refetch lands.
 *
 * It is read exactly the way the API route's gate reads it — the same
 * `readSessionProvenance`, over the locally-verified claims and the switch
 * route's marker cookie — so the seed and the gate can never disagree. That
 * includes a token carrying no `session_id`: the reader owns that case and
 * answers `own`, so this must not pre-empt it with a guard of its own, which
 * would seed nothing where the gate would have seeded the stronger answer.
 * `undefined` on a genuine failure, which puts the surface back on the honest
 * "wait for the fetch" path rather than inventing an answer.
 */
async function getSessionProvenance(): Promise<SessionProvenance | undefined> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return undefined;
    return await readSessionProvenance({
      claims,
      cookies: await cookies(),
    });
  } catch {
    return undefined;
  }
}

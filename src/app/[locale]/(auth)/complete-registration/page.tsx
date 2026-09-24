import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants";
import { ROLE_POST_LOGIN_PATHS } from "@/lib/constants/roles";
import { COMPLETE_REGISTRATION_GEDU_QUERY } from "@/lib/navigation/post-auth-redirect";
import { readUtmFromSearchParams } from "@/lib/utm";
import { CompleteRegistrationForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("createAccount"),
    robots: { index: false, follow: false },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Where an account created through Google finishes registering. The proxy
 * holds such a customer here from every protected page; anyone else who lands
 * here is sent where their role belongs.
 *
 * `?as=gedu` asks for the Gedu variant, and the `utm_*` params carry the
 * landing link's attribution across the Google round trip — both put on the
 * address by the register page's button and carried by the callback.
 */
export default async function CompleteRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const userWithProfile = await getUserWithProfile();
  if (!userWithProfile) redirect(ROUTES.login);

  const { profile } = userWithProfile;
  if (!profile) redirect(ROUTES.login);
  if (profile.role !== "customer" || profile.registration_completed_at !== null) {
    redirect(ROLE_POST_LOGIN_PATHS[profile.role]);
  }

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== undefined) query.append(key, entry);
    }
  }

  // Google's name for the account, off the verified token's metadata. The
  // halves when Google gave them, else the full name split at its last space.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const { firstName, lastName } = namesFromMetadata(data?.claims.user_metadata);

  return (
    <CompleteRegistrationForm
      variant={
        query.get("as") === COMPLETE_REGISTRATION_GEDU_QUERY.as ? "gedu" : "parent"
      }
      email={profile.email}
      initialFirstName={firstName}
      initialLastName={lastName}
      utm={readUtmFromSearchParams(query)}
    />
  );
}

function stringField(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Prefill only: every value is editable, and the route validates what is sent. */
function namesFromMetadata(metadata: Record<string, unknown> | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!metadata) return { firstName: "", lastName: "" };

  const given = stringField(metadata, "given_name");
  const family = stringField(metadata, "family_name");
  if (given || family) return { firstName: given, lastName: family };

  const full =
    stringField(metadata, "full_name") || stringField(metadata, "name");
  const split = full.lastIndexOf(" ");
  if (split === -1) return { firstName: full, lastName: "" };
  return {
    firstName: full.slice(0, split).trim(),
    lastName: full.slice(split + 1).trim(),
  };
}

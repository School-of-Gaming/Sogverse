import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("createAccount"),
    robots: { index: false, follow: false },
  };
}

/**
 * Where an account created through Google finishes registering. A placeholder
 * until the finish form lands: it exists so the route, its pathnames entry and
 * the proxy's gate have somewhere to point.
 */
export default async function CompleteRegistrationPage() {
  const t = await getTranslations("metadata.pages");
  return <h1 className="text-2xl font-bold">{t("createAccount")}</h1>;
}

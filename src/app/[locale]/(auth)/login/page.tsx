import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { LoginForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const shared = await localizedPageMetadata("/login", await getLocale());
  return {
    ...shared,
    title: t("pages.signIn"),
    description: t("descriptions.signIn"),
    // Spread rather than replaced: Next assigns a child's `openGraph` over its
    // parent's wholesale, so a block declared here without the shared one loses
    // the card image and the locale along with it.
    openGraph: {
      ...shared.openGraph,
      title: t("og.pages.signIn.title"),
      description: t("og.pages.signIn.description"),
    },
  };
}

/** `?redirect=` is read server-side — see the note on the register page. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { redirect } = await searchParams;
  return <LoginForm redirect={typeof redirect === "string" ? redirect : null} />;
}

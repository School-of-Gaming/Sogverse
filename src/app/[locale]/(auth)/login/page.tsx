import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("signIn"),
    description: "Sign in to your School of Gaming account",
    openGraph: {
      title: "Sign in to School of Gaming",
      description: "Sign in to your School of Gaming account to manage clubs, gamers, and more.",
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

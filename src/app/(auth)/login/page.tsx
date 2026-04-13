import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("signIn"),
    description: "Sign in to your Sogverse account",
    openGraph: {
      title: "Sign In to Sogverse",
      description: "Sign in to your Sogverse account to manage clubs, gamers, and more.",
    },
  };
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-lg animate-pulse rounded-lg bg-card" />}>
      <LoginForm />
    </Suspense>
  );
}

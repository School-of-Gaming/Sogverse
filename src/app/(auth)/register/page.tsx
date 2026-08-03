import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("createAccount"),
    description: "Create your Sogverse parent account",
    openGraph: {
      title: "Join Sogverse",
      description: "Create your Sogverse parent account and enroll your child in Minecraft clubs led by professional game educators.",
    },
  };
}

/**
 * `?redirect=` is read here rather than with `useSearchParams()` in the form.
 * A search-params hook in a client component has to sit under a `<Suspense>`
 * boundary, and it is the boundary's *fallback* the server prerenders — so this
 * page used to ship a grey card and only assemble the real form after
 * hydration. Reading the param server-side makes the page dynamic (correct: an
 * auth form is not cacheable content) and the form fully server-rendered.
 *
 * A repeated `?redirect=a&redirect=b` arrives as an array, which is not a
 * destination; it collapses to null and the user lands on the fallback route.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { redirect } = await searchParams;
  return <RegisterForm redirect={typeof redirect === "string" ? redirect : null} />;
}

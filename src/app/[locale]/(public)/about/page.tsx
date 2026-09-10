import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { AboutFaq } from "@/components/about/about-faq";
import { AboutSection } from "@/components/about/about-section";
import { SectionPill } from "@/components/about/section-pill";
import { YtySection } from "@/components/about/yty-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("about"),
    // English literal, like every other page description in the app —
    // localising metadata descriptions is tracked as its own piece of work.
    description:
      "Who School of Gaming is, what Yty is, and answers to the questions families ask before they enrol.",
  };
}

/**
 * The public About page: identity, the public FAQ, and Yty.
 *
 * The FAQ sits second because it is what a parent came for — the practical
 * questions they are deciding on — and Yty last because it is the idea behind
 * the offer rather than an answer to anything they asked.
 *
 * This copy used to be two anchored sections on the home page, which put it out
 * of reach of every family who has an account — the proxy bounces a signed-in
 * reader off `/` to their dashboard. It lives on its own route so the header
 * can point everyone at it, signed in or not.
 *
 * The page title is an `sr-only` `h1`. The three sections keep the heading
 * levels they were written with (each opens at `h2`), so the outline reads
 * page → section → sub-heading with nothing renumbered, and a sighted reader
 * still meets the About section's own hero rather than a second title above it.
 * It reads from `about`, a content namespace, not from `metadata` — that one is
 * stripped from the client bundle and names documents, not page content.
 */
export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <>
      <h1 className="sr-only">{t("pageTitle")}</h1>

      <SectionPill />

      <AboutSection id="about" />

      <AboutFaq id="faq" />

      <YtySection id="yty" />
    </>
  );
}

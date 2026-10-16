import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { useTranslations } from "next-intl";
import { AboutFaq } from "@/components/about/about-faq";
import { AboutSection } from "@/components/about/about-section";
import { ParentTestimonials } from "@/components/about/parent-testimonials";
import { readHomeTestimonials } from "@/components/home/home-testimonials.server";
import { SectionPill } from "@/components/about/section-pill";
import { YtySection } from "@/components/about/yty-section";
import { Heading } from "@sog/ui";
import type { HomeTestimonials } from "@/services/testimonials";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/about", await getLocale())),
    title: t("pages.about"),
    description: t("descriptions.about"),
  };
}

/**
 * The public About page: identity, what parents say, the public FAQ, and Yty.
 *
 * The parents' quotes follow the identity section, so a reader meets what
 * families saw before the mechanics. The FAQ comes next because it is what a
 * parent came for — the practical questions they are deciding on — and Yty
 * last because it is the idea behind the offer rather than an answer to
 * anything they asked.
 *
 * This copy used to be two anchored sections on the home page, which put it out
 * of reach of every family who has an account — the proxy bounces a signed-in
 * reader off `/` to their dashboard. It lives on its own route so the header
 * can point everyone at it, signed in or not.
 *
 * The page title is an `sr-only` `h1`. The four sections keep the heading
 * levels they were written with (each opens at `h2`), so the outline reads
 * page → section → sub-heading with nothing renumbered, and a sighted reader
 * still meets the About section's own hero rather than a second title above it.
 * It reads from `about`, a content namespace, not from `metadata` — that one is
 * stripped from the client bundle and names documents, not page content.
 *
 * The parents' quotes are the home spots' testimonials, read per request.
 * The section stays, with its heading, even while every spot is empty: the
 * section pill links to it.
 */
export default async function AboutPage() {
  return <AboutBody testimonials={await readHomeTestimonials()} />;
}

function AboutBody({ testimonials }: { testimonials: HomeTestimonials }) {
  const t = useTranslations("about");

  return (
    <>
      <Heading level={1} step="hero" srOnly>
        {t("pageTitle")}
      </Heading>

      <SectionPill />

      <AboutSection id="about" />

      <ParentTestimonials id="parents" testimonials={testimonials} />

      <AboutFaq id="faq" />

      <YtySection id="yty" />
    </>
  );
}

import { FAQ_ITEM_KEYS } from "@/components/about/about-faq";
import { loadMessages } from "@/i18n/messages";
import { getPathname } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { LOCALE_CONFIG } from "@/lib/constants/locales";
import type { StaticAppHref } from "@/lib/constants/routes";
import { messageToPlainText } from "@/lib/i18n/plain-text";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";

/**
 * `/llms.txt` — the site, in plain English, for a language model that has been
 * pointed at us and has one fetch to spend understanding what we are.
 *
 * The file follows the llmstxt.org convention: an H1 naming the site, a
 * blockquote holding the one-paragraph summary, then short prose sections and
 * a list of the pages worth reading. What a crawler gets here is what it would
 * get by reading the home page and the About page, minus the navigation, the
 * markup and the five-way locale fan-out.
 *
 * **Every sentence is read out of the `en` catalog rather than written here.**
 * A hand-written summary of the site is a second copy of the site's own copy,
 * and the second copy is the one that goes stale — quietly, because nothing
 * renders it. Reading the catalog means an edit to the home hero or an added
 * FAQ question reaches this file with no further work, and the FAQ order comes
 * from the About page's own key list for the same reason.
 *
 * **One file, in English, on purpose.** The convention is a single
 * `/llms.txt` at the site root — there is no locale-negotiated form of it, and
 * a reader arriving here has no locale to negotiate with. The Languages
 * section carries the absolute home URL of each indexed locale instead, so a
 * consumer that wants the Finnish pages is told exactly where they are rather
 * than left to guess a prefix.
 *
 * **Nothing here names a `/schools` URL, a product page or an unlisted
 * product.** Municipality clubs are offered to families in specific Finnish
 * municipalities and are not promoted; an unlisted product is reachable by
 * direct link and must never be findable. Both trees are `noindex` on the
 * page, and this file is a discovery surface, so leaving them out is the same
 * decision stated once more where a reader of this file will see it.
 */

/**
 * The public pages this file points at, in the order a stranger would want
 * them: what we are, what we run, how to join, then the policies.
 *
 * They are `StaticAppHref` keys and their URLs are built through
 * `getPathname`, never joined from a slug: the pathnames map is the only thing
 * that knows `/shop` is `/fr/boutique`, and a hand-written path here would be
 * a 404 handed to a crawler. `/roblox` and the programme pages are absent
 * along with `/schools` and every product page — they are `noindex` for their
 * own reasons — and so is anything behind a login.
 */
const LINKED_PAGES: { href: StaticAppHref; label: string; note: string }[] = [
  { href: "/", label: "Home", note: "What we do, and what is running now." },
  {
    href: "/about",
    label: "About",
    note: "Our mission, how clubs work, what we do for parents, and the questions above in full.",
  },
  {
    href: "/shop",
    label: "Shop",
    note: "Every club, camp and event open for enrolment, with schedules and prices.",
  },
  {
    href: "/register",
    label: "Create a parent account",
    note: "Where a family starts; children are added from the parent's account.",
  },
  { href: "/privacy", label: "Privacy policy", note: "What we hold and why." },
  {
    href: "/terms-and-conditions",
    label: "Terms and conditions",
    note: "The terms a family signs up under.",
  },
  {
    href: "/anti-bullying-and-discipline",
    label: "Anti-bullying and discipline policy",
    note: "How we handle bullying and toxicity, and what happens when someone crosses the line.",
  },
];

/** One `## Heading` followed by its paragraphs, blank-line separated. */
function section(heading: string, paragraphs: string[]): string {
  return [`## ${heading}`, ...paragraphs].join("\n\n");
}

function buildLlmsTxt(
  messages: Awaited<ReturnType<typeof loadMessages>>,
  baseUrl: string,
): string {
  const { about } = messages;
  const url = (href: StaticAppHref) =>
    `${baseUrl}${getPathname({ href, locale: "en" })}`;

  const faq = FAQ_ITEM_KEYS.flatMap((key) => {
    const item = about.faq.items[key];
    return [
      `### ${item.question}`,
      messageToPlainText(item.answer, { supportEmail: SUPPORT_EMAIL }),
    ];
  });

  return `${[
    "# School of Gaming",
    `> ${messages.metadata.description}`,
    section("What we offer", [
      messages.home.hero.subtitle,
      about.hero.subtitle,
      about.mission.text,
    ]),
    section("How clubs work", [
      about.howClubsWork.paragraph1,
      about.howClubsWork.paragraph2,
      about.howClubsWork.paragraph3,
      about.howClubsWork.paragraph4,
    ]),
    section("Safety and who runs the sessions", [
      `${about.values.keepChildrenSafe.title}. ${about.values.keepChildrenSafe.description}`,
      `${about.values.friendsCarry.title}. ${about.values.friendsCarry.description}`,
    ]),
    section("For parents", [
      about.forParents.paragraph1,
      about.forParents.paragraph2,
      `${about.values.familyInTheLoop.title}. ${about.values.familyInTheLoop.description}`,
    ]),
    section(about.faq.heading, faq),
    section("Company", [
      "School of Gaming is the brand; Sogverse is the platform families log in to.",
      "Legal name: School of Gaming Galactic Oy. A Finnish company, Business ID 3110461-1 (VAT FI31104611).",
      `Contact: ${SUPPORT_EMAIL}`,
    ]),
    section("Pages", [
      LINKED_PAGES.map(
        ({ href, label, note }) => `- [${label}](${url(href)}): ${note}`,
      ).join("\n"),
    ]),
    section("Languages", [
      "The same pages, in each language we publish. English is the source.",
      INDEXED_LOCALES.map(
        (locale) =>
          `- ${LOCALE_CONFIG[locale].label} (${locale}): ${baseUrl}${getPathname({ href: "/", locale })}`,
      ).join("\n"),
    ]),
  ].join("\n\n")}\n`;
}

export async function GET() {
  const messages = await loadMessages("en");
  const body = buildLlmsTxt(messages, process.env.NEXT_PUBLIC_SITE_URL!);

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Publicly cacheable: the body depends on nothing but the deployed
      // catalog, and it is fetched by crawlers we do not control. That posture
      // is exactly why the path is excluded from the proxy's matcher — the
      // proxy may attach `Set-Cookie` to whatever response it handles, and a
      // shared cache holding one of those would serve one person's session to
      // every anonymous requester. See the matcher comment in `src/proxy.ts`.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

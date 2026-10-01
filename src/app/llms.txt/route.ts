import { FAQ_ITEM_KEYS } from "@/components/about/about-faq";
import {
  libraryArticleCanonicalPath,
  libraryArticleLocales,
} from "@/components/library/article/article-metadata";
import { loadMessages } from "@/i18n/messages";
import { getPathname } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { LOCALE_CONFIG } from "@/lib/constants/locales";
import type { StaticAppHref } from "@/lib/constants/routes";
import { messageToPlainText } from "@/lib/i18n/plain-text";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
import { BUSINESS_ID, LEGAL_NAME, VAT_ID } from "@/lib/seo/organization";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  localizeArticleSummary,
  type PublishedLibraryArticleSummary,
} from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

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
 * **The prose about us is read out of the `en` catalog rather than written
 * here.** A hand-written summary of the site is a second copy of the site's
 * own copy, and the second copy is the one that goes stale — quietly, because
 * nothing renders it. Reading the catalog means an edit to the home hero or an
 * added FAQ question reaches this file with no further work, and the FAQ order
 * comes from the About page's own key list for the same reason. What *is*
 * written here is this file's own scaffolding, which no page renders: the
 * section headings, the one-line note beside each link, and the company line —
 * and that line's facts come from the constants the `Organization` graph uses,
 * so the two cannot disagree.
 *
 * **One file, in English, on purpose.** The convention is a single
 * `/llms.txt` at the site root — there is no locale-negotiated form of it, and
 * a reader arriving here has no locale to negotiate with. The Languages
 * section carries the absolute home URL of each indexed locale instead, so a
 * consumer that wants the Finnish pages is told exactly where they are rather
 * than left to guess a prefix.
 *
 * **The Library's articles are listed one by one**, each at the address an
 * English reader is sent to, with its summary: they are the site's own
 * writing for parents, which is exactly what a model pointed here can cite.
 * They are read from the database on every request, anonymously and with no
 * cookies, so the file is the same for whoever asks; a failed read leaves the
 * section out rather than failing the file.
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
    href: "/team",
    label: "Team",
    note: "The people behind School of Gaming: the office team and the Game Educators who lead the sessions, each with a page of their own.",
  },
  {
    href: "/library",
    label: "Library",
    note: "Our articles for parents on gaming, screen time and online safety, each listed below.",
  },
  {
    href: "/register",
    label: "Create a parent account",
    note: "Where a family starts; children are added from the parent's account.",
  },
  {
    href: "/login",
    label: "Sign in",
    note: "Where a returning parent picks up — their own account, and each child's.",
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

/**
 * A locale's language name, in English.
 *
 * `LOCALE_CONFIG.label` is an English *fallback*, not a display string
 * (`src/i18n/CLAUDE.md`), and the shared language-name hook that normally
 * resolves one is a React hook with no route handler to run in. This file is
 * English by design — a single `/llms.txt` at the site root, with no locale to
 * negotiate — so the English display name is the right one to build here, and
 * the label is exactly the fallback `Intl` is given for a tag it does not know.
 */
function languageName(locale: (typeof INDEXED_LOCALES)[number]): string {
  return (
    new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ??
    LOCALE_CONFIG[locale].label
  );
}

/** One `## Heading` followed by its paragraphs, blank-line separated. */
function section(heading: string, paragraphs: string[]): string {
  return [`## ${heading}`, ...paragraphs].join("\n\n");
}

/**
 * One line per live article written in an indexed locale: its title and
 * summary in the version an English reader is shown, linked to the page that
 * version canonicalises to — so an article written only in Finnish is listed
 * in Finnish, at its Finnish address. Newest first, as the Library lists them.
 */
function libraryLines(
  published: readonly PublishedLibraryArticleSummary[],
  baseUrl: string,
): string[] {
  return published.flatMap((article) => {
    const shown = localizeArticleSummary(article, "en");
    if (shown === null || libraryArticleLocales(article).length === 0) return [];
    const path = libraryArticleCanonicalPath(published, article, "en");
    return [`- [${shown.title}](${baseUrl}${path}): ${shown.summary}`];
  });
}

function buildLlmsTxt(
  messages: Awaited<ReturnType<typeof loadMessages>>,
  baseUrl: string,
  published: readonly PublishedLibraryArticleSummary[] | null,
): string {
  const { about } = messages;
  const url = (href: StaticAppHref) =>
    `${baseUrl}${getPathname({ href, locale: "en" })}`;

  const articles = published === null ? [] : libraryLines(published, baseUrl);
  const library =
    articles.length === 0
      ? []
      : [
          section("Library", [
            "Articles for parents, written by School of Gaming. An article not written in English is listed in the language it was written in, at that language's address.",
            articles.join("\n"),
          ]),
        ];

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
      `Legal name: ${LEGAL_NAME}. A Finnish company, Business ID ${BUSINESS_ID} (VAT ${VAT_ID}).`,
      `Contact: ${SUPPORT_EMAIL}`,
    ]),
    section("Pages", [
      LINKED_PAGES.map(
        ({ href, label, note }) => `- [${label}](${url(href)}): ${note}`,
      ).join("\n"),
    ]),
    ...library,
    section("Languages", [
      "The same pages, in each language we publish. English is the source.",
      INDEXED_LOCALES.map(
        (locale) =>
          `- ${languageName(locale)} (${locale}): ${baseUrl}${getPathname({ href: "/", locale })}`,
      ).join("\n"),
    ]),
  ].join("\n\n")}\n`;
}

/** The live Library articles, read with the anon key and no cookies. */
async function readLiveArticles() {
  return new LibraryService(createAnonClient()).listPublishedArticles();
}

/** Built per request: the Library section reads the live articles, and no build may need a database. */
export const dynamic = "force-dynamic";

export async function GET() {
  const messages = await loadMessages("en");
  const published = await readLiveArticles().catch((error: unknown) => {
    console.error("[llms.txt] the live Library articles were not read:", error);
    return null;
  });
  const body = buildLlmsTxt(
    messages,
    process.env.NEXT_PUBLIC_SITE_URL!,
    published,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Publicly cacheable: the body depends on nothing but the deployed
      // catalog and what is live in the Library, the same for every reader,
      // and it is fetched by crawlers we do not control. That posture
      // is exactly why the path is excluded from the proxy's matcher — the
      // proxy may attach `Set-Cookie` to whatever response it handles, and a
      // shared cache holding one of those would serve one person's session to
      // every anonymous requester. See the matcher comment in `src/proxy.ts`.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

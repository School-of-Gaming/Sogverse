import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod-v4";
import { articleAddress, articleSlug } from "@/components/library/article-address";
import { libraryArticlePath } from "@/components/library/article/article-metadata";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_MESSAGE_KEY,
  type LibraryCategory,
} from "@/components/library/categories";
import { getPathname } from "@/i18n/navigation";
import {
  describeMarkdownSubset,
  markdownOutsideSubset,
} from "@/lib/authored-markdown-subset";
import { ROUTES } from "@/lib/constants";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  COVER_PREVIEW,
  COVER_THUMBNAIL,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
  coverUrl,
} from "@/lib/mcp/cover-images";
import {
  NOT_FOUND,
  OVERWRITES,
  READ_ONLY,
  answer,
  articleId,
  asAdmin,
  refusal,
} from "@/lib/mcp/library-call";
import {
  isCompleteVersion,
  missingInVersion,
  type AdminLibraryArticle,
  type PublishedLibraryArticleSummary,
} from "@/services/library";
import { Constants } from "@/types";

/*
 * The Library tools: an admin reads, writes, publishes and unpublishes Library
 * articles from an AI app. Every tool runs the Library service on the admin's
 * own token-bound client, so the admin-guarded functions and row policies
 * decide exactly as they do in the editor, and a save is stamped with the
 * admin and the app it came through. Writes go through the partial writers —
 * one language version or the category alone — never the editor's whole save
 * (`src/services/library/CLAUDE.md`).
 *
 * The cover tools are in `library-covers.ts` and the uploader in
 * `cover-uploader.ts`; this module shows a cover as a picture where it reads
 * one (`cover-images.ts`).
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

const LANGUAGES = SUPPORTED_LOCALES.map(
  (locale) => `${locale} (${LOCALE_CONFIG[locale].label})`,
).join(", ");

const VERSIONS =
  "An article is written per language: each language version has its own title, summary and body, and the category and cover belong to the whole article. Every version needs a title; a version is complete when its title, summary and body are all written.";

const PUBLISHING =
  "Publishing needs a category and at least one complete version. It puts every complete version live at once, leaves an incomplete one out, and takes down a live language whose version is no longer complete. A cover is optional. Saving never changes what readers see until the next publish.";

const ADDRESSES =
  "A live language's public address is derived from its title, so retitling a live language changes its address on the next publish and links people already shared stop working (the article's id address keeps working).";

const READERS =
  "Readers see the version in their own language, else English, else the first one written.";

const NO_DELETE =
  "There is no delete: unpublishing takes an article down and keeps it to work on.";

const BODY = `The body is markdown limited to ${describeMarkdownSubset("article")}. Anything else — images, code, block quotes, rules, deeper headings, tables, strikethrough, raw HTML — is refused with the construct named, and nothing is saved. Task lists are not markdown here: a "- [ ]" item is an ordinary bullet showing its brackets.`;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const locale = z
  .enum(SUPPORTED_LOCALES)
  .describe(`The language version, by site locale: ${LANGUAGES}.`);

const category = z
  .enum(Constants.public.Enums.library_article_category)
  .describe("A category value, as list_library_categories returns them.");

const title = z
  .string()
  .trim()
  .min(1, "Every language version needs a title")
  .describe("The version's title. Required.");

const summary = z
  .string()
  .trim()
  .describe("A sentence or two shown on the article's card and under its title.");

const body = z.string().trim().describe(`The article itself. ${BODY}`);

// ---------------------------------------------------------------------------
// Reading an article
// ---------------------------------------------------------------------------

/** Each category's English label, for an admin talking to their AI app. */
async function categoryLabels(): Promise<(value: LibraryCategory) => string> {
  const t = await getTranslations({ locale: "en", namespace: "library.categories" });
  return (value) => t(LIBRARY_CATEGORY_MESSAGE_KEY[value]);
}

function previewLink(origin: string, id: string, at: SupportedLocale): string {
  return `${origin}${getPathname({ href: ROUTES.libraryArticlePreview(id), locale: at })}`;
}

function editorLink(origin: string, id: string): string {
  return `${origin}${getPathname({ href: ROUTES.admin.libraryArticle(id), locale: "en" })}`;
}

/** A live language's public link, at the address a reader of that language shares. */
function publicLink(
  origin: string,
  published: readonly PublishedLibraryArticleSummary[],
  id: string,
  at: SupportedLocale,
): string {
  return `${origin}${libraryArticlePath({
    locale: at,
    address: articleAddress(published, { id }, at),
  })}`;
}

/**
 * What a publish would do now: the languages it would put live, the written
 * ones it would leave out, the live ones it would take down, and what stops
 * it. The database decides completeness the same way, and refuses with the
 * same missing pieces, so this is a forecast of its answer and never a gate.
 */
function publishForecast(article: AdminLibraryArticle) {
  const { draft, publication } = article;
  const complete = draft.versions.filter(isCompleteVersion).map((v) => v.locale);
  const live = publication?.versions.map((v) => v.locale) ?? [];
  const missing: string[] = [];
  if (draft.category === null) missing.push("a category");
  if (complete.length === 0) {
    missing.push("a language version with a title, a summary and a body");
  }
  return {
    canPublish: missing.length === 0,
    missing,
    wouldPutLive: complete,
    wouldLeaveOut: draft.versions
      .map((v) => v.locale)
      .filter((l) => !complete.includes(l)),
    wouldTakeDown: live.filter((l) => !complete.includes(l)),
  };
}

function lastSaved(draft: AdminLibraryArticle["draft"]) {
  return { at: draft.updatedAt, by: draft.lastSavedBy, via: draft.lastSavedVia };
}

async function articleView(
  article: AdminLibraryArticle,
  published: readonly PublishedLibraryArticleSummary[],
  origin: string,
) {
  const { draft, publication } = article;
  const labels = await categoryLabels();
  const liveLocales = new Set(publication?.versions.map((v) => v.locale) ?? []);
  return {
    articleId: draft.id,
    category: draft.category,
    categoryLabel: draft.category === null ? null : labels(draft.category),
    cover:
      draft.coverImageId === null
        ? null
        : {
            catalogueId: draft.coverImageId,
            label: draft.coverLabel,
            publicUrl: draft.coverPath === null ? null : coverUrl(draft.coverPath),
          },
    createdAt: draft.createdAt,
    lastSaved: lastSaved(draft),
    versions: draft.versions.map((version) => ({
      locale: version.locale,
      language: LOCALE_CONFIG[version.locale].label,
      title: version.title,
      summary: version.summary,
      body: version.body,
      complete: isCompleteVersion(version),
      missing: missingInVersion(version),
      live: liveLocales.has(version.locale),
      previewLink: previewLink(origin, draft.id, version.locale),
    })),
    hasUnpublishedChanges: article.hasUnpublishedChanges,
    publish: publishForecast(article),
    live:
      publication === null
        ? null
        : {
            category: publication.category,
            firstPublishedAt: publication.firstPublishedAt,
            publishedAt: publication.publishedAt,
            coverUrl:
              publication.coverPath === null ? null : coverUrl(publication.coverPath),
            versions: publication.versions.map((version) => ({
              locale: version.locale,
              title: version.title,
              summary: version.summary,
              publicLink: publicLink(origin, published, draft.id, version.locale),
            })),
          },
    editorLink: editorLink(origin, draft.id),
  };
}

/** The bodies a write would store, checked against the article subset before anything is sent. */
function bodyRefusal(markdown: string): CallToolResult | null {
  const outside = markdownOutsideSubset(markdown, "article");
  if (outside.length === 0) return null;
  const named = outside
    .map(({ construct, lines }) =>
      lines.length === 0 ? construct : `${construct} on line ${lines.join(", ")}`,
    )
    .join("; ");
  return refusal(
    `Nothing was saved: the body uses markdown the Library does not show — ${named}. Articles keep only ${describeMarkdownSubset("article")}. Rewrite those parts and save again.`,
  );
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function registerLibraryTools(server: McpServer): void {
  server.registerTool(
    "list_library_articles",
    {
      title: "List Library articles",
      description: `Every School of Gaming Library article — the parent-facing articles on the public /library pages — most recently saved first: its id, each language's title, its category, its cover's public URL, whether it is live, whether it has saved changes readers do not see yet, and when, by whom and through which AI app it was last saved. Bodies are not included; get_library_article reads one whole. With includeCovers, the covers come as small pictures too, for the first ${MAX_IMAGES_PER_RESULT} articles that have one. ${VERSIONS}`,
      inputSchema: z.object({
        includeCovers: z
          .boolean()
          .optional()
          .describe("Also show each article's cover as a small picture. Off by default."),
      }),
      annotations: READ_ONLY,
    },
    ({ includeCovers }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        const articles = await service.listAdminArticles();
        const value = {
          articles: articles.map((article) => ({
            articleId: article.id,
            titles: article.versions.map(({ locale: l, title: t }) => ({
              locale: l,
              title: t,
            })),
            category: article.category,
            coverUrl: article.coverPath === null ? null : coverUrl(article.coverPath),
            live: article.isPublished,
            hasUnpublishedChanges: article.hasUnpublishedChanges,
            lastSaved: {
              at: article.updatedAt,
              by: article.lastSavedBy,
              via: article.lastSavedVia,
            },
          })),
        };
        if (!includeCovers) return answer(value);
        return answerWithCovers(
          value,
          articles.flatMap((article) =>
            article.coverPath === null
              ? []
              : [
                  {
                    path: article.coverPath,
                    caption: `Cover of article ${article.id} ("${article.versions[0]?.title ?? ""}"): ${coverUrl(article.coverPath)}`,
                  },
                ],
          ),
          COVER_THUMBNAIL,
        );
      }),
  );

  server.registerTool(
    "get_library_article",
    {
      title: "Read a Library article",
      description: `One Library article whole: every language version (title, summary, body) with whether it is complete and what it still needs; the category; the cover by its picture catalogue entry and public URL, shown as a picture as well; what a publish now would put live, leave out and take down, and what would stop it; what readers see now, with each live language's public link; a preview link per language; and the link to its editor in Sogverse. ${PUBLISHING} ${READERS}`,
      inputSchema: z.object({ articleId }),
      annotations: READ_ONLY,
    },
    ({ articleId: id }, ctx) =>
      asAdmin(ctx, async ({ service, origin }) => {
        const [article, published] = await Promise.all([
          service.getAdminArticle(id),
          service.listPublishedArticles(),
        ]);
        if (article === null) return refusal(NOT_FOUND);
        const view = await articleView(article, published, origin);
        const { coverPath } = article.draft;
        return answerWithCovers(
          view,
          coverPath === null || view.cover === null
            ? []
            : [
                {
                  path: coverPath,
                  caption: `The article's cover, catalogue entry ${view.cover.catalogueId} ("${view.cover.label ?? ""}"): ${coverUrl(coverPath)}`,
                },
              ],
          COVER_PREVIEW,
        );
      }),
  );

  server.registerTool(
    "list_library_categories",
    {
      title: "List Library categories",
      description:
        "The categories a Library article can be in: each value, which the other tools take, and its English label as readers see it. Every live article is in exactly one; publishing needs one.",
      annotations: READ_ONLY,
    },
    (ctx) =>
      asAdmin(ctx, async () => {
        const labels = await categoryLabels();
        return answer({
          categories: LIBRARY_CATEGORIES.map((value) => ({ value, label: labels(value) })),
        });
      }),
  );

  server.registerTool(
    "get_library_preview_link",
    {
      title: "Preview a Library article",
      description: `A link the admin opens in their browser, signed in to Sogverse as an admin, to see the article's saved working copy exactly as a parent would meet it if it were published now, in one language's page. Without a version in that language the preview shows the one a reader there would get. ${READERS} Only admins can open it.`,
      inputSchema: z.object({ articleId, locale }),
      annotations: READ_ONLY,
    },
    ({ articleId: id, locale: at }, ctx) =>
      asAdmin(ctx, async ({ service, origin }) => {
        const article = await service.getAdminArticle(id);
        if (article === null) return refusal(NOT_FOUND);
        const shown = resolveTranslation(article.draft.versions, at);
        return answer({
          articleId: id,
          locale: at,
          shows: shown?.locale ?? at,
          previewLink: previewLink(origin, id, at),
        });
      }),
  );

  server.registerTool(
    "create_library_article",
    {
      title: "Create a Library article",
      description: `Start a new Library article with one language version; add the others one at a time with save_library_article_version. It is created unpublished, without a cover. ${VERSIONS} ${PUBLISHING}`,
      inputSchema: z.object({
        locale,
        title,
        summary: summary.optional(),
        body: body.optional(),
        category: category.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input, ctx) =>
      asAdmin(ctx, async ({ service, origin }) => {
        const refused = bodyRefusal(input.body ?? "");
        if (refused) return refused;
        const id = await service.createArticle({
          versions: [
            {
              locale: input.locale,
              title: input.title,
              summary: input.summary ?? "",
              body: input.body ?? "",
            },
          ],
          category: input.category ?? null,
          coverImageId: null,
        });
        return answer({
          articleId: id,
          editorLink: editorLink(origin, id),
          previewLink: previewLink(origin, id, input.locale),
        });
      }),
  );

  server.registerTool(
    "save_library_article_version",
    {
      title: "Save a Library article's language version",
      description: `Write one language version of an article — its title, summary and body together, replacing what that language held — or add a language it does not have yet. No other language, nor the category or cover, is touched. Send all three fields: an empty summary or body is saved empty. Readers see nothing until the next publish. ${ADDRESSES} Leaving a live language incomplete means the next publish takes it down. ${BODY}`,
      inputSchema: z.object({ articleId, locale, title, summary, body }),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        const refused = bodyRefusal(input.body);
        if (refused) return refused;
        await service.saveArticleVersion(input.articleId, {
          locale: input.locale,
          title: input.title,
          summary: input.summary,
          body: input.body,
        });
        const article = await service.getAdminArticle(input.articleId);
        if (article === null) return refusal(NOT_FOUND);
        const saved = article.draft.versions.find((v) => v.locale === input.locale);
        const liveSlug =
          article.publication === null
            ? null
            : articleSlug(article.publication, input.locale);
        return answer({
          articleId: input.articleId,
          locale: input.locale,
          complete: saved ? isCompleteVersion(saved) : false,
          missing: saved ? missingInVersion(saved) : [],
          languageIsLive: liveSlug !== null,
          // The address a reader of this language shares, derived from the
          // title: a new one replaces it on the next publish.
          publicAddressChangesOnPublish:
            liveSlug !== null && liveSlug !== articleSlug(article.draft, input.locale),
          hasUnpublishedChanges: article.hasUnpublishedChanges,
          publish: publishForecast(article),
        });
      }),
  );

  server.registerTool(
    "set_library_article_category",
    {
      title: "Set a Library article's category",
      description:
        "Set the article's category, for every language at once; null clears it. Nothing else is touched. Readers see it after the next publish, and an article cannot be published without one.",
      inputSchema: z.object({ articleId, category: category.nullable() }),
      annotations: OVERWRITES,
    },
    ({ articleId: id, category: value }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        await service.setArticleCategory(id, value);
        const labels = await categoryLabels();
        return answer({
          articleId: id,
          category: value,
          categoryLabel: value === null ? null : labels(value),
        });
      }),
  );

  server.registerTool(
    "publish_library_article",
    {
      title: "Publish a Library article",
      description: `Make the article's saved working copy what readers see, replacing what was live. ${PUBLISHING} Answers which languages went live, which were left out or taken down, and each live language's public link. ${ADDRESSES} Read get_library_article first to see what a publish would do.`,
      inputSchema: z.object({ articleId }),
      annotations: OVERWRITES,
    },
    ({ articleId: id }, ctx) =>
      asAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminArticle(id);
        if (before === null) return refusal(NOT_FOUND);
        const forecast = publishForecast(before);
        await service.publishArticle(id);
        const published = await service.listPublishedArticles();
        return answer({
          articleId: id,
          live: forecast.wouldPutLive,
          leftOut: forecast.wouldLeaveOut,
          takenDown: forecast.wouldTakeDown,
          publicLinks: forecast.wouldPutLive.map((l) => ({
            locale: l,
            publicLink: publicLink(origin, published, id, l),
          })),
        });
      }),
  );

  server.registerTool(
    "unpublish_library_article",
    {
      title: "Unpublish a Library article",
      description: `Take the article off the public Library, every language at once. Its working copy is kept exactly as it was, to edit and publish again. ${NO_DELETE} Unpublishing an article that is not live changes nothing.`,
      inputSchema: z.object({ articleId }),
      annotations: OVERWRITES,
    },
    ({ articleId: id }, ctx) =>
      asAdmin(ctx, async ({ service }) => {
        const before = await service.getAdminArticle(id);
        if (before === null) return refusal(NOT_FOUND);
        await service.unpublishArticle(id);
        return answer({ articleId: id, wasLive: before.publication !== null, live: false });
      }),
  );
}

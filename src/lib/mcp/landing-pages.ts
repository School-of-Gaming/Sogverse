import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import {
  describeMarkdownSubset,
  markdownOutsideSubset,
} from "@/lib/authored-markdown-subset";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  landingSections,
  type LandingSection,
  type LandingSectionOf,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  COVER_THUMBNAIL,
  answerWithCovers,
} from "@/lib/mcp/cover-images";
import { OVERWRITES, READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import {
  NOT_FOUND,
  asLandingAdmin,
  editorLink,
  pageId,
  previewLink,
  publicLink,
  slugLink,
} from "@/lib/mcp/landing-pages-call";
import {
  MCP_LANDING_SECTIONS,
  SECTIONS_MANUAL,
  mcpLandingStructure,
  mcpSectionTexts,
  withIds,
} from "@/lib/mcp/landing-pages-sections";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { landingSlug, type AdminLandingPage } from "@/services/landing-pages";
import {
  LANDING_SLUG_MAX_LENGTH,
  LANDING_SUMMARY_MAX_LENGTH,
  LANDING_TITLE_MAX_LENGTH,
} from "@/services/landing-pages/landing-pages.contracts";

/*
 * The landing page tools: an admin authors, publishes and unpublishes the
 * marketing landing pages from an AI app. Every tool runs the landing page
 * service on the admin's own token-bound client, so the admin-guarded
 * functions decide exactly as they do in the editor, and a save is stamped
 * with the admin and the app it came through. Writes go through the two
 * partial writers — the structure alone, or one language's words alone —
 * never the editor's whole save (`src/services/landing-pages/CLAUDE.md`).
 *
 * The picture tools are in `landing-pages-images.ts`; the sections as an AI
 * app writes them in `landing-pages-sections.ts`.
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

const LANGUAGES = SUPPORTED_LOCALES.map(
  (locale) => `${locale} (${LOCALE_CONFIG[locale].label})`,
).join(", ");

const MODEL =
  "A landing page is a marketing page on the public site — for a school, a city, a business, an event — written to be found by search engines and AI apps. Its structure (the ordered sections with their pictures, buttons, icons and items) is shared by every language; each language version holds the page's title, summary, slug and every section's words, keyed by section id.";

const COMPLETE =
  "A language version is complete when its title, summary and slug are written and every section has every required word in that language.";

const PUBLISHING =
  "Publishing puts the structure and every complete version live at once, leaves an incomplete version out (taking that language down if it was live), and is refused when no version is complete. Saving never changes what readers see until the next publish; a section added to a live page makes every language incomplete until its words are written there.";

const SLUGS = `A version's slug is its address: lowercase a–z, digits and single hyphens, at most ${LANDING_SLUG_MAX_LENGTH} characters, never shaped like an id, unique per language across every page. Left out, a version keeps the slug it has, or one is derived from its title when it has none. Once a language has been published its slug is fixed for good, through unpublishing too — there are no redirects — and a change is refused.`;

const ADDRESSES =
  "A live language is read at its slug address, /<language>/discover/<slug> with the discover segment in that language; the id address /<language>/discover/<id> works in every language, showing a reader the version in their language, else English, else the first written.";

const STRUCTURE_WRITES =
  "Removing a section drops its words in every language, and so does sending it without its id, which makes it a new section; the same holds for items. Keep every id you want to keep.";

const MARKDOWN = `Markdown fields (a text section's body, an FAQ answer) take only ${describeMarkdownSubset("landing")}; anything else is refused with the construct named, and nothing is saved. Every other field is plain text.`;

const NO_DELETE =
  "There is no delete: unpublishing takes a page down and keeps it to work on.";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const locale = z
  .enum(SUPPORTED_LOCALES)
  .describe(`The language version, by site locale: ${LANGUAGES}.`);

const title = z
  .string()
  .trim()
  .min(1, "Every language version needs a title")
  .max(LANDING_TITLE_MAX_LENGTH, `A title is at most ${LANDING_TITLE_MAX_LENGTH} characters`)
  .describe(
    `The page's title in this language: its browser tab and search result title. At most ${LANDING_TITLE_MAX_LENGTH} characters.`,
  );

const summary = z
  .string()
  .trim()
  .max(
    LANDING_SUMMARY_MAX_LENGTH,
    `A summary is at most ${LANDING_SUMMARY_MAX_LENGTH} characters`,
  )
  .describe(
    `A sentence or two saying what the page offers: its search engines' description. At most ${LANDING_SUMMARY_MAX_LENGTH} characters.`,
  );

/** A slug, by the service's own rule. */
const slug = z
  .string()
  .trim()
  .superRefine((value, context) => {
    const checked = landingSlug.safeParse(value);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        context.addIssue({ code: "custom", message: issue.message });
      }
    }
  })
  .describe(`The version's address. ${SLUGS}`);

// ---------------------------------------------------------------------------
// Checking an AI app's input against the page
// ---------------------------------------------------------------------------

/** A zod 3 issue list, as one line per issue with its path. */
function issueLines(issues: readonly { path: (string | number)[]; message: string }[]): string {
  return issues
    .map(({ path, message }) => (path.length === 0 ? message : `${path.join(".")}: ${message}`))
    .join("; ");
}

/**
 * The structure an AI app sent, with new sections and items given ids and
 * checked by the registry's own schema — arrangement rule included — or the
 * refusal naming what is wrong.
 */
function readStructure(
  sections: readonly unknown[],
): { sections: LandingSection[] } | { refusal: CallToolResult } {
  const parsed = landingSections.safeParse(withIds(sections, () => crypto.randomUUID()));
  if (parsed.success) return { sections: parsed.data };
  return {
    refusal: refusal(
      `Nothing was saved: the structure is not one a page can have — ${issueLines(parsed.error.issues)}.`,
    ),
  };
}

/** The keys one section's words may hold items under, and the ids they may be. */
function itemIdsOf<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionOf<Type>,
) {
  return MCP_LANDING_SECTIONS[type].itemIds(section);
}

/** What is wrong with one section's words, as lines. */
function sectionWordsProblems(section: LandingSection, words: unknown): string[] {
  const name = `section ${section.id} (${section.type})`;
  const parsed = MCP_LANDING_SECTIONS[section.type].text.safeParse(words);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) =>
        `${name}${issue.path.length ? ` ${issue.path.join(".")}` : ""}: ${issue.message}`,
    );
  }
  const problems: string[] = [];
  const items = itemIdsOf(section.type, section);
  if (items !== null) {
    const keyed: unknown = Object.getOwnPropertyDescriptor(parsed.data, items.key)?.value;
    for (const key of Object.keys(typeof keyed === "object" && keyed !== null ? keyed : {})) {
      if (!items.ids.includes(key)) {
        problems.push(`${name} ${items.key}: ${key} is not one of the section's item ids`);
      }
    }
  }
  for (const { path, value } of MCP_LANDING_SECTIONS[section.type].markdownFields(parsed.data)) {
    const outside = markdownOutsideSubset(value, "landing");
    if (outside.length === 0) continue;
    const named = outside
      .map(({ construct, lines }) =>
        lines.length === 0 ? construct : `${construct} on line ${lines.join(", ")}`,
      )
      .join("; ");
    problems.push(`${name} ${path} uses markdown a landing page does not show — ${named}`);
  }
  return problems;
}

/**
 * One language's words checked against the page's structure — every key a
 * section, every entry its type's fields, item keys its items, markdown
 * inside the subset — or the refusal naming each problem.
 */
function readWords(
  sections: readonly LandingSection[],
  texts: Record<string, unknown>,
): { texts: Record<string, unknown> } | { refusal: CallToolResult } {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const problems = Object.entries(texts).flatMap(([id, words]) => {
    const section = byId.get(id);
    return section === undefined
      ? [`${id} is not the id of a section of this page`]
      : sectionWordsProblems(section, words);
  });
  if (problems.length === 0) return { texts };
  return {
    refusal: refusal(
      `Nothing was saved: ${problems.join("; ")}. get_landing_page lists the page's section and item ids.`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

/**
 * What a publish would do now: the languages it would put live, the written
 * ones it would leave out, the live ones it would take down. The database
 * decides completeness by the same rule, so this is a forecast of its answer
 * and never a gate.
 */
function publishForecast(page: AdminLandingPage) {
  const { draft, publication } = page;
  const complete = draft.versions.filter((v) => v.missing.length === 0).map((v) => v.locale);
  const live = publication?.versions.map((v) => v.locale) ?? [];
  return {
    canPublish: complete.length > 0,
    wouldPutLive: complete,
    wouldLeaveOut: draft.versions
      .filter((v) => !complete.includes(v.locale))
      .map((v) => ({ locale: v.locale, missing: v.missing })),
    wouldTakeDown: live.filter((l) => !complete.includes(l)),
  };
}

function lastSaved(draft: AdminLandingPage["draft"]) {
  return { at: draft.updatedAt, by: draft.lastSavedBy, via: draft.lastSavedVia };
}

function pageView(page: AdminLandingPage, origin: string) {
  const { draft, publication } = page;
  const liveLocales = new Set(publication?.versions.map((v) => v.locale) ?? []);
  return {
    pageId: draft.id,
    sections: draft.sections,
    pictures: Object.entries(draft.imagePaths).map(([catalogueId, path]) => ({
      catalogueId,
      publicUrl: catalogueImageUrl("landing_image", path),
    })),
    createdAt: draft.createdAt,
    lastSaved: lastSaved(draft),
    versions: draft.versions.map((version) => ({
      locale: version.locale,
      language: LOCALE_CONFIG[version.locale].label,
      title: version.title,
      summary: version.summary,
      slug: version.slug,
      slugFixed: version.slugFixed,
      address: slugLink(origin, version.slug, version.locale),
      sectionTexts: version.sectionTexts,
      complete: version.missing.length === 0,
      missing: version.missing,
      live: liveLocales.has(version.locale),
      previewLink: previewLink(origin, draft.id, version.locale),
    })),
    hasUnpublishedChanges: page.hasUnpublishedChanges,
    publish: publishForecast(page),
    live:
      publication === null
        ? null
        : {
            firstPublishedAt: publication.firstPublishedAt,
            publishedAt: publication.publishedAt,
            versions: publication.versions.map((version) => ({
              locale: version.locale,
              title: version.title,
              summary: version.summary,
              publicLink: publicLink(origin, publication, version.locale),
            })),
          },
    editorLink: editorLink(origin, draft.id),
  };
}

/** Each language's completeness, after a write. */
function languages(page: AdminLandingPage) {
  return page.draft.versions.map((version) => ({
    locale: version.locale,
    complete: version.missing.length === 0,
    missing: version.missing,
  }));
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export function registerLandingPageTools(server: McpServer): void {
  server.registerTool(
    "list_landing_pages",
    {
      title: "List landing pages",
      description: `Every School of Gaming landing page, most recently saved first: its id, each language's title, slug and whether it is complete, whether it is live, whether it has saved changes readers do not see yet, and when, by whom and through which AI app it was last saved. get_landing_page reads one whole. ${MODEL}`,
      annotations: READ_ONLY,
    },
    (ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const pages = await service.listAdminPages();
        return answer({
          pages: pages.map((page) => ({
            pageId: page.id,
            versions: page.versions.map((version) => ({
              locale: version.locale,
              title: version.title,
              slug: version.slug,
              complete: version.isComplete,
            })),
            live: page.isPublished,
            hasUnpublishedChanges: page.hasUnpublishedChanges,
            lastSaved: {
              at: page.updatedAt,
              by: page.lastSavedBy,
              via: page.lastSavedVia,
            },
          })),
        });
      }),
  );

  server.registerTool(
    "get_landing_page",
    {
      title: "Read a landing page",
      description: `One landing page whole: its structure (every section with its id, type and shared fields), its pictures shown small, and every language version — title, summary, slug and whether it is fixed, its address, every section's words, whether it is complete and what it still needs (as paths: sections.<section id>.<field>) — with what a publish now would put live, leave out and take down; what readers see now, with each live language's public link; a preview link per language; and the link to its editor in Sogverse. ${COMPLETE} ${PUBLISHING}`,
      inputSchema: z.object({ pageId }),
      annotations: READ_ONLY,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const page = await service.getAdminPage(id);
        if (page === null) return refusal(NOT_FOUND);
        const view = pageView(page, origin);
        return answerWithCovers(
          view,
          Object.entries(page.draft.imagePaths).map(([catalogueId, path]) => ({
            path,
            caption: `Picture ${catalogueId}: ${catalogueImageUrl("landing_image", path)}`,
          })),
          COVER_THUMBNAIL,
          "landing_image",
        );
      }),
  );

  server.registerTool(
    "get_landing_page_preview_link",
    {
      title: "Preview a landing page",
      description:
        "A link the admin opens in their browser, signed in to Sogverse as an admin, to see the page's saved working copy as a reader would meet it if it were published now, in one language. Without a version in that language the preview shows the one a reader there would get: theirs, else English, else the first written. Only admins can open it.",
      inputSchema: z.object({ pageId, locale }),
      annotations: READ_ONLY,
    },
    ({ pageId: id, locale: at }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const page = await service.getAdminPage(id);
        if (page === null) return refusal(NOT_FOUND);
        const shown = resolveTranslation(page.draft.versions, at);
        return answer({
          pageId: id,
          locale: at,
          shows: shown?.locale ?? at,
          previewLink: previewLink(origin, id, at),
        });
      }),
  );

  server.registerTool(
    "create_landing_page",
    {
      title: "Create a landing page",
      description: `Start a new landing page with its structure and one language version; add the other languages one at a time with save_landing_page_text. It is created unpublished. Sections and items sent without ids are given them, and the answer lists the structure with every id. To write the sections' words in this same call, give the sections and items ids of your own (any lowercase uuid) and key sectionTexts by them; otherwise write the words afterwards with save_landing_page_text. The answer says the address the page will have once published. ${MODEL} ${COMPLETE} ${SLUGS} ${MARKDOWN}\n\n${SECTIONS_MANUAL}`,
      inputSchema: z.object({
        locale,
        title,
        summary: summary.optional(),
        slug: slug.optional(),
        sections: mcpLandingStructure,
        sectionTexts: mcpSectionTexts.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const structure = readStructure(input.sections);
        if ("refusal" in structure) return structure.refusal;
        const words = readWords(structure.sections, input.sectionTexts ?? {});
        if ("refusal" in words) return words.refusal;
        const id = await service.createPage({
          sections: structure.sections,
          versions: [
            {
              locale: input.locale,
              title: input.title,
              summary: input.summary ?? "",
              slug: input.slug,
              sectionTexts: words.texts,
            },
          ],
        });
        const page = await service.getAdminPage(id);
        if (page === null) return refusal(NOT_FOUND);
        const version = page.draft.versions.find((v) => v.locale === input.locale);
        return answer({
          pageId: id,
          sections: page.draft.sections,
          locale: input.locale,
          slug: version?.slug ?? "",
          address: slugLink(origin, version?.slug ?? "", input.locale),
          complete: version !== undefined && version.missing.length === 0,
          missing: version?.missing ?? [],
          previewLink: previewLink(origin, id, input.locale),
          editorLink: editorLink(origin, id),
        });
      }),
  );

  server.registerTool(
    "save_landing_page_structure",
    {
      title: "Save a landing page's structure",
      description: `Replace the page's structure — its ordered sections and their shared fields — for every language at once. No language's words are written, except that ${STRUCTURE_WRITES.charAt(0).toLowerCase()}${STRUCTURE_WRITES.slice(1)} Send the whole structure, read from get_landing_page: what is left out is removed. The answer lists the saved structure with every id, the sections removed, and each language's completeness under the new structure. Readers see nothing until the next publish. ${PUBLISHING}\n\n${SECTIONS_MANUAL}`,
      inputSchema: z.object({ pageId, sections: mcpLandingStructure }),
      annotations: OVERWRITES,
    },
    ({ pageId: id, sections }, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        const structure = readStructure(sections);
        if ("refusal" in structure) return structure.refusal;
        await service.saveStructure(id, structure.sections);
        const after = await service.getAdminPage(id);
        if (after === null) return refusal(NOT_FOUND);
        const kept = new Set(after.draft.sections.map((section) => section.id));
        return answer({
          pageId: id,
          sections: after.draft.sections,
          removedSections: before.draft.sections
            .filter((section) => !kept.has(section.id))
            .map((section) => ({ id: section.id, type: section.type })),
          languages: languages(after),
          hasUnpublishedChanges: after.hasUnpublishedChanges,
          publish: publishForecast(after),
        });
      }),
  );

  server.registerTool(
    "save_landing_page_text",
    {
      title: "Save a landing page's language version",
      description: `Write one language version of the page — its title, summary, optional slug and every section's words — replacing what that language held, or add a language it does not have yet. No other language, nor the structure, is touched. sectionTexts is the whole of this language's words: a section left out is saved with no words in this language. The words are checked against the page's structure as it is now. Readers see nothing until the next publish; leaving a live language incomplete means the next publish takes it down. ${SLUGS} ${MARKDOWN}`,
      inputSchema: z.object({
        pageId,
        locale,
        title,
        summary,
        slug: slug.optional(),
        sectionTexts: mcpSectionTexts,
      }),
      annotations: OVERWRITES,
    },
    (input, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(input.pageId);
        if (before === null) return refusal(NOT_FOUND);
        const words = readWords(before.draft.sections, input.sectionTexts);
        if ("refusal" in words) return words.refusal;
        await service.saveVersion(input.pageId, {
          locale: input.locale,
          title: input.title,
          summary: input.summary,
          slug: input.slug,
          sectionTexts: words.texts,
        });
        const page = await service.getAdminPage(input.pageId);
        if (page === null) return refusal(NOT_FOUND);
        const saved = page.draft.versions.find((v) => v.locale === input.locale);
        return answer({
          pageId: input.pageId,
          locale: input.locale,
          slug: saved?.slug ?? "",
          slugFixed: saved?.slugFixed ?? false,
          address: slugLink(origin, saved?.slug ?? "", input.locale),
          complete: saved !== undefined && saved.missing.length === 0,
          missing: saved?.missing ?? [],
          languageIsLive:
            page.publication?.versions.some((v) => v.locale === input.locale) ?? false,
          hasUnpublishedChanges: page.hasUnpublishedChanges,
          publish: publishForecast(page),
        });
      }),
  );

  server.registerTool(
    "publish_landing_page",
    {
      title: "Publish a landing page",
      description: `Make the page's saved working copy what readers see, replacing what was live. ${PUBLISHING} Publishing a language fixes its slug for good. Answers which languages went live, which were left out or taken down, and each live language's public link. ${ADDRESSES} Read get_landing_page first to see what a publish would do.`,
      inputSchema: z.object({ pageId }),
      annotations: OVERWRITES,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service, origin }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        const wasLive = before.publication?.versions.map((v) => v.locale) ?? [];
        await service.publishPage(id);
        // Read back from what the publish did, never forecast from the read
        // before it: a save landing in between changes what goes live.
        const after = await service.getAdminPage(id);
        if (after === null) return refusal(NOT_FOUND);
        const { publication } = after;
        const liveLocales = publication?.versions.map((v) => v.locale) ?? [];
        return answer({
          pageId: id,
          live: liveLocales,
          leftOut: after.draft.versions
            .filter((v) => !liveLocales.includes(v.locale))
            .map((v) => ({ locale: v.locale, missing: v.missing })),
          takenDown: wasLive.filter((l) => !liveLocales.includes(l)),
          publicLinks: liveLocales.map((l) => ({
            locale: l,
            publicLink: publication === null ? null : publicLink(origin, publication, l),
          })),
        });
      }),
  );

  server.registerTool(
    "unpublish_landing_page",
    {
      title: "Unpublish a landing page",
      description: `Take the page off the site, every language at once. Its working copy is kept exactly as it was, to edit and publish again, and every slug that was published stays fixed. ${NO_DELETE} Unpublishing a page that is not live changes nothing.`,
      inputSchema: z.object({ pageId }),
      annotations: OVERWRITES,
    },
    ({ pageId: id }, ctx) =>
      asLandingAdmin(ctx, async ({ service }) => {
        const before = await service.getAdminPage(id);
        if (before === null) return refusal(NOT_FOUND);
        await service.unpublishPage(id);
        return answer({ pageId: id, wasLive: before.publication !== null, live: false });
      }),
  );
}


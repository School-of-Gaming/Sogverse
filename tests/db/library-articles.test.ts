import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
  createBearerTestClient,
  oauthGrantFor,
  revokeOAuthGrant,
  type OAuthGrant,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import type { CatalogueImageInsert } from "@/types";
import { LibraryService } from "@/services/library/library.service";

/**
 * The Library: `library_articles` (an article's admin-only working copy),
 * `library_article_publications` (its public published copy, whose row
 * existing IS the article being live), each with its per-language versions
 * (`library_article_translations`, `library_article_publication_translations`),
 * their admin-guarded writers — the whole-article ones and the partial ones
 * that write one version or one field — and
 * covers: a link from either copy to a library_cover entry of the shared image
 * catalogue, the trigger that derives each copy's `cover_path` from it, and
 * `repoint_library_covers`, the catalogue replace's half for the Library. Last,
 * the record of who last saved a working copy and through which AI app, made
 * with a real OAuth grant from the stack's own authorization server.
 *
 * No Library table carries a write grant for any Data API role, so there is no
 * write-IDOR case to make: a non-admin's direct write is refused at the grant,
 * which is asserted here once per table. The spine sweeps the RPCs with
 * all-NULL arguments; what it cannot show is that a refusal is about the ROLE,
 * so each wrong role is tried here with a payload an admin would succeed with.
 *
 * Most cases go through `LibraryService` on a signed-in admin's session rather
 * than raw RPC calls, so the service's own mapping — slugs to the enum, the
 * embedded published copy, the "unpublished changes" comparison — is proven
 * against real Postgres output.
 *
 * Fixture UUIDs 825-82b (see the allocation registry in product-helpers.ts).
 * Every assertion is scoped to this file's own rows.
 */

/** A complete working copy, publishable as seeded. */
const ARTICLE_COMPLETE = "00000000-0000-0000-0000-000000000825";
/** A draft with a title and nothing else. */
const ARTICLE_DRAFT = "00000000-0000-0000-0000-000000000826";
/** An article id that must NEVER exist. */
const ARTICLE_MISSING = "00000000-0000-0000-0000-000000000827";

/** Two Library cover entries — pictures an article may take as its cover. */
const COVER_A = "00000000-0000-0000-0000-000000000828";
const COVER_B = "00000000-0000-0000-0000-000000000829";
/** A product picture — a purpose a cover may not have. */
const PRODUCT_PICTURE = "00000000-0000-0000-0000-00000000082a";
/** An entry removed during the run, taking its covers with it. */
const COVER_DOOMED = "00000000-0000-0000-0000-00000000082b";
const ENTRIES = [COVER_A, COVER_B, PRODUCT_PICTURE, COVER_DOOMED];

/** A valid catalogue hash, 64 lowercase hex characters, from an 8-char seed. */
const hex = (seed: string): string => seed.repeat(8);

const ENTRY_ROWS: CatalogueImageInsert[] = [
  { id: COVER_A, label: "Library fixture A", sha256: hex("11a8a825"), path: `${hex("11a8a825")}.jpg`, purpose: "library_cover" },
  { id: COVER_B, label: "Library fixture B", sha256: hex("11b8b829"), path: `${hex("11b8b829")}.jpg`, purpose: "library_cover" },
  {
    id: PRODUCT_PICTURE,
    label: "Library fixture product",
    sha256: hex("11c8c82a"),
    path: `${hex("11c8c82a")}.jpg`,
    purpose: "product",
  },
  {
    id: COVER_DOOMED,
    label: "Library fixture doomed",
    sha256: hex("11d8d82b"),
    path: `${hex("11d8d82b")}.jpg`,
    purpose: "library_cover",
  },
];

const pathOf = (entry: string): string | undefined =>
  ENTRY_ROWS.find((row) => row.id === entry)?.path;

/** Ids minted by create during the run, deleted with the rest at the end. */
const minted: string[] = [];

/** A complete English version. */
const EN = {
  locale: "en" as const,
  title: "Fixture: screen time that adds up",
  summary: "A standfirst.",
  body: "## A heading\n\nA paragraph.",
};

/** A complete Finnish version. */
const FI = {
  locale: "fi" as const,
  title: "Fixture: ruutuaika",
  summary: "Tiivistelmä.",
  body: "Kappale.",
};

type VersionInput = {
  locale: "en" | "fi" | "sv";
  title: string;
  summary: string;
  body: string;
};

/** A complete working copy, as the service takes it: English alone. */
function completeInput() {
  return {
    versions: [EN] as VersionInput[],
    category: "screen_time" as const,
    coverImageId: COVER_A as string | null,
  };
}

/** A draft as the service takes it: a title and nothing else. */
const DRAFT_INPUT = {
  versions: [
    { locale: "en" as const, title: "Fixture: an unfinished draft", summary: "", body: "" },
  ],
  category: null,
  coverImageId: null,
};

describe("library articles", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let service: LibraryService;

  function clientFor(role: string): SupabaseClient<Database> {
    if (role === "customer") return customer;
    if (role === "gedu") return gedu;
    return gamer;
  }

  async function cleanUp() {
    await admin
      .from("library_articles")
      .delete()
      .in("id", [ARTICLE_COMPLETE, ARTICLE_DRAFT, ...minted]);
    await admin.from("catalogue_images").delete().in("id", ENTRIES);
  }

  /** Put both fixtures back to their seeded state, unpublished. */
  async function reseed() {
    await cleanUp();
    const entries = await admin.from("catalogue_images").insert(ENTRY_ROWS);
    expect(entries.error).toBeNull();
    const { error } = await admin.from("library_articles").insert([
      { id: ARTICLE_COMPLETE, category: "screen_time", cover_image_id: COVER_A },
      // Every column spelled out: a multi-row insert sends the union of the
      // rows' keys, so an omitted one arrives as an explicit NULL rather than
      // taking its default.
      { id: ARTICLE_DRAFT, category: null, cover_image_id: null },
    ]);
    expect(error).toBeNull();
    const versions = await admin.from("library_article_translations").insert([
      { article_id: ARTICLE_COMPLETE, ...EN },
      { article_id: ARTICLE_DRAFT, ...DRAFT_INPUT.versions[0] },
    ]);
    expect(versions.error).toBeNull();
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gedu = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    anon = createAnonTestClient();
    service = new LibraryService(adminAuth);
    await reseed();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // The working copy
  // -------------------------------------------------------------------------

  describe("create and save", () => {
    it("creates a draft from a title alone, stamping the admin as author", async () => {
      const id = await service.createArticle({
        versions: [{ locale: "fi", title: "  Fixture: minted  ", summary: "", body: "" }],
        category: null,
        coverImageId: null,
      });
      minted.push(id);

      const { data: row } = await admin
        .from("library_articles")
        .select(
          "category, cover_image_id, cover_path, author_id, versions:library_article_translations(locale, title, summary, body, is_complete)",
        )
        .eq("id", id)
        .single();
      const { data: me } = await adminAuth.auth.getUser();
      expect(row).toEqual({
        category: null,
        cover_image_id: null,
        cover_path: null,
        author_id: me.user?.id,
        versions: [
          { locale: "fi", title: "Fixture: minted", summary: "", body: "", is_complete: false },
        ],
      });
    });

    it("refuses an article with no version, and a version with no title, creating nothing", async () => {
      const none = await adminAuth.rpc("create_library_article", {
        p_versions: [],
      });
      expect(none.error?.code).toBe("23514");
      expect(none.error?.message).toMatch(/title/);

      const untitled = await adminAuth.rpc("create_library_article", {
        p_versions: [
          { locale: "en", title: "Fixture: never created" },
          { locale: "fi", title: "   ", summary: "Tiivistelmä." },
        ],
      });
      expect(untitled.error?.code).toBe("23514");
      expect(untitled.error?.message).toMatch(/fi version needs a title/);

      const { count } = await admin
        .from("library_article_translations")
        .select("article_id", { count: "exact", head: true })
        .eq("title", "Fixture: never created");
      expect(count).toBe(0);
    });

    it("refuses one language twice", async () => {
      const { error } = await adminAuth.rpc("save_library_article", {
        p_id: ARTICLE_DRAFT,
        p_versions: [
          { locale: "en", title: "A" },
          { locale: "en", title: "B" },
        ],
      });
      expect(error?.code).toBe("22023");
    });

    it("replaces the version set whole: a language left out is removed", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, FI],
      });
      expect(
        (await service.getAdminArticle(ARTICLE_COMPLETE))?.draft.versions.map(
          (version) => version.locale,
        ),
      ).toEqual(["en", "fi"]);

      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [FI],
      });
      expect(
        (await service.getAdminArticle(ARTICLE_COMPLETE))?.draft.versions,
      ).toEqual([FI]);
    });

    it("derives the cover path from the linked entry, reads its label, and clears both with the link", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_DRAFT, {
        ...DRAFT_INPUT,
        coverImageId: COVER_B,
      });
      const linked = await service.getAdminArticle(ARTICLE_DRAFT);
      expect(linked?.draft).toMatchObject({
        coverImageId: COVER_B,
        coverPath: pathOf(COVER_B),
        coverLabel: "Library fixture B",
      });

      await service.saveArticle(ARTICLE_DRAFT, DRAFT_INPUT);
      const cleared = await service.getAdminArticle(ARTICLE_DRAFT);
      expect(cleared?.draft).toMatchObject({
        coverImageId: null,
        coverPath: null,
        coverLabel: null,
      });
    });

    it("overwrites a cover path any statement writes itself", async () => {
      await reseed();
      const { data, error } = await admin
        .from("library_articles")
        .update({ cover_path: `${hex("deadbeef")}.jpg` })
        .eq("id", ARTICLE_COMPLETE)
        .select("cover_path")
        .single();
      expect(error).toBeNull();
      expect(data?.cover_path).toBe(pathOf(COVER_A));
    });

    it("refuses a product picture as a cover, with a readable check_violation", async () => {
      const { error } = await adminAuth.rpc("save_library_article", {
        p_id: ARTICLE_DRAFT,
        p_versions: [{ locale: "en", title: "T" }],
        p_cover_image_id: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/library_cover/);
    });

    it("refuses a cover that is no longer in the catalogue", async () => {
      const { error } = await adminAuth.rpc("save_library_article", {
        p_id: ARTICLE_DRAFT,
        p_versions: [{ locale: "en", title: "T" }],
        p_cover_image_id: ARTICLE_MISSING,
      });
      expect(error?.code).toBe("23503");
    });

    it("refuses to save an id no article has", async () => {
      await expect(
        service.saveArticle(ARTICLE_MISSING, DRAFT_INPUT),
      ).rejects.toMatchObject({ code: "P0002" });
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s creating or saving with a payload an admin would succeed with",
      async (role) => {
        const created = await clientFor(role).rpc("create_library_article", {
          p_versions: [{ locale: "en", title: `Fixture: by ${role}` }],
        });
        expect(created.error?.code).toBe("42501");

        const saved = await clientFor(role).rpc("save_library_article", {
          p_id: ARTICLE_DRAFT,
          p_versions: [{ locale: "en", title: `Renamed by ${role}` }],
        });
        expect(saved.error?.code).toBe("42501");

        const { data: rows } = await admin
          .from("library_article_translations")
          .select("title")
          .eq("article_id", ARTICLE_DRAFT);
        expect(rows).toEqual([{ title: "Fixture: an unfinished draft" }]);
      },
    );
  });

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  describe("publish and unpublish", () => {
    it("refuses an article with no category and no complete version, naming both", async () => {
      await reseed();
      await expect(service.publishArticle(ARTICLE_DRAFT)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringMatching(/category.*language version/),
      });

      const { count } = await admin
        .from("library_article_publications")
        .select("article_id", { count: "exact", head: true })
        .eq("article_id", ARTICLE_DRAFT);
      expect(count).toBe(0);
    });

    it("refuses to publish or unpublish an id no article has", async () => {
      await expect(service.publishArticle(ARTICLE_MISSING)).rejects.toMatchObject(
        { code: "P0002" },
      );
      await expect(
        service.unpublishArticle(ARTICLE_MISSING),
      ).rejects.toMatchObject({ code: "P0002" });
    });

    it("publishes, then keeps the live copy unchanged while the working copy is edited", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);

      const live = await service.getPublishedArticle(ARTICLE_COMPLETE);
      expect(live).toMatchObject({
        id: ARTICLE_COMPLETE,
        versions: [EN],
        category: "screen_time",
        coverPath: pathOf(COVER_A),
      });
      expect(live?.firstPublishedAt).toBe(live?.publishedAt);

      const afterPublish = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(afterPublish?.hasUnpublishedChanges).toBe(false);

      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        category: "learning",
        versions: [
          { ...EN, title: "Fixture: edited, not yet live", body: "A different body." },
        ],
      });

      expect(await service.getPublishedArticle(ARTICLE_COMPLETE)).toEqual(live);

      const edited = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(edited?.draft.versions[0]?.title).toBe("Fixture: edited, not yet live");
      expect(edited?.draft.category).toBe("learning");
      expect(edited?.publication).toEqual(live);
      expect(edited?.hasUnpublishedChanges).toBe(true);

      const listed = (await service.listAdminArticles()).find(
        (item) => item.id === ARTICLE_COMPLETE,
      );
      expect(listed).toMatchObject({
        versions: [
          { locale: "en", title: "Fixture: edited, not yet live", summary: EN.summary },
        ],
        category: "learning",
        isPublished: true,
        hasUnpublishedChanges: true,
      });
    });

    it("sees a body-only edit as an unpublished change", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [{ ...EN, body: `${EN.body} One more sentence.` }],
      });

      const listed = (await service.listAdminArticles()).find(
        (item) => item.id === ARTICLE_COMPLETE,
      );
      expect(listed?.hasUnpublishedChanges).toBe(true);
    });

    it("republishes the edit, keeping first_published_at and moving published_at", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      const first = await service.getPublishedArticle(ARTICLE_COMPLETE);

      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [{ ...EN, title: "Fixture: second version" }],
        coverImageId: COVER_B,
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      const second = await service.getPublishedArticle(ARTICLE_COMPLETE);
      expect(second?.versions[0]?.title).toBe("Fixture: second version");
      expect(second?.coverPath).toBe(pathOf(COVER_B));
      expect(second?.firstPublishedAt).toBe(first?.firstPublishedAt);
      expect(Date.parse(second!.publishedAt)).toBeGreaterThan(
        Date.parse(first!.publishedAt),
      );

      const listed = (await service.listAdminArticles()).find(
        (item) => item.id === ARTICLE_COMPLETE,
      );
      expect(listed?.hasUnpublishedChanges).toBe(false);
    });

    it("unpublishes, leaving the working copy as it was, and is a no-op when repeated", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      await service.unpublishArticle(ARTICLE_COMPLETE);

      expect(await service.getPublishedArticle(ARTICLE_COMPLETE)).toBeNull();
      const after = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(after?.publication).toBeNull();
      expect(after?.hasUnpublishedChanges).toBe(false);
      expect(after?.draft).toMatchObject({
        versions: [EN],
        coverImageId: COVER_A,
        category: "screen_time",
      });

      await expect(
        service.unpublishArticle(ARTICLE_COMPLETE),
      ).resolves.toBeUndefined();
    });

    it("refuses a published version with a blank field at the schema itself", async () => {
      // The backstop behind publish copying only complete versions: a row
      // arriving any other way still cannot put a blank on a public page.
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      const { error } = await admin
        .from("library_article_publication_translations")
        .insert({ article_id: ARTICLE_COMPLETE, locale: "fi", title: "T", summary: "   ", body: "B" });
      expect(error?.code).toBe("23514");
    });

    it("publishes every complete version at once and leaves an incomplete one out", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, FI, { locale: "sv", title: "Fixture: halvfärdig", summary: "", body: "" }],
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      const live = await new LibraryService(anon).getPublishedArticle(ARTICLE_COMPLETE);
      expect(live?.versions).toEqual([EN, FI]);

      // The half-written Swedish is not something publishing would change.
      const admined = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(admined?.hasUnpublishedChanges).toBe(false);
    });

    it("publishes an article whose only complete version is not English", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [{ ...EN, body: "" }, FI],
      });
      await service.publishArticle(ARTICLE_COMPLETE);
      const live = await service.getPublishedArticle(ARTICLE_COMPLETE);
      expect(live?.versions).toEqual([FI]);
    });

    it("takes a live version down when a republish finds it incomplete", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, FI],
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, { ...FI, summary: "" }],
      });
      // Publishing now would take the Finnish down, which is a change.
      expect(
        (await service.getAdminArticle(ARTICLE_COMPLETE))?.hasUnpublishedChanges,
      ).toBe(true);

      await service.publishArticle(ARTICLE_COMPLETE);
      expect(
        (await service.getPublishedArticle(ARTICLE_COMPLETE))?.versions,
      ).toEqual([EN]);
    });

    it("unpublishes every version with the article", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, FI],
      });
      await service.publishArticle(ARTICLE_COMPLETE);
      await service.unpublishArticle(ARTICLE_COMPLETE);

      const { count } = await admin
        .from("library_article_publication_translations")
        .select("article_id", { count: "exact", head: true })
        .eq("article_id", ARTICLE_COMPLETE);
      expect(count).toBe(0);
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s publishing or unpublishing",
      async (role) => {
        await reseed();
        const published = await clientFor(role).rpc("publish_library_article", {
          p_id: ARTICLE_COMPLETE,
        });
        expect(published.error?.code).toBe("42501");
        expect(await service.getPublishedArticle(ARTICLE_COMPLETE)).toBeNull();

        await service.publishArticle(ARTICLE_COMPLETE);
        const unpublished = await clientFor(role).rpc(
          "unpublish_library_article",
          { p_id: ARTICLE_COMPLETE },
        );
        expect(unpublished.error?.code).toBe("42501");
        expect(await service.getPublishedArticle(ARTICLE_COMPLETE)).not.toBeNull();
      },
    );
  });

  // -------------------------------------------------------------------------
  // Who reads what
  // -------------------------------------------------------------------------

  describe("reads", () => {
    beforeAll(async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, { ...FI, body: "" }],
      });
      await service.publishArticle(ARTICLE_COMPLETE);
      // A working edit after publishing, which no reader may see.
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [{ ...EN, title: "Fixture: unpublished edit" }, { ...FI, body: "" }],
      });
    });

    it("lets anon read only published versions", async () => {
      const live = await anon
        .from("library_article_publication_translations")
        .select("locale, title")
        .eq("article_id", ARTICLE_COMPLETE);
      expect(live.error).toBeNull();
      expect(live.data).toEqual([{ locale: "en", title: EN.title }]);

      // A working version is not merely filtered out for anon: anon holds no grant.
      const working = await anon
        .from("library_article_translations")
        .select("locale")
        .eq("article_id", ARTICLE_COMPLETE);
      expect(working.error).not.toBeNull();
    });

    it("lets anon read published articles through the service, and nothing else", async () => {
      const publicService = new LibraryService(anon);

      const one = await publicService.getPublishedArticle(ARTICLE_COMPLETE);
      expect(one).toMatchObject({ id: ARTICLE_COMPLETE, category: "screen_time" });

      const all = await publicService.listPublishedArticles();
      const ids = all.map((article) => article.id);
      expect(ids).toContain(ARTICLE_COMPLETE);
      expect(ids).not.toContain(ARTICLE_DRAFT);
      // A list feeds cards, so it never carries a body.
      expect(all.filter((article) => "body" in article)).toEqual([]);

      // A working copy is not merely filtered out for anon: anon holds no grant.
      const drafts = await anon
        .from("library_articles")
        .select("id")
        .in("id", [ARTICLE_COMPLETE, ARTICLE_DRAFT]);
      expect(drafts.error).not.toBeNull();
    });

    it("answers a malformed id as not found rather than failing", async () => {
      expect(
        await new LibraryService(anon).getPublishedArticle("not-a-uuid"),
      ).toBeNull();
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "shows a %s published articles and zero working copies",
      async (role) => {
        const drafts = await clientFor(role)
          .from("library_articles")
          .select("id")
          .in("id", [ARTICLE_COMPLETE, ARTICLE_DRAFT]);
        expect(drafts.error).toBeNull();
        expect(drafts.data).toEqual([]);

        const draftVersions = await clientFor(role)
          .from("library_article_translations")
          .select("locale")
          .in("article_id", [ARTICLE_COMPLETE, ARTICLE_DRAFT]);
        expect(draftVersions.error).toBeNull();
        expect(draftVersions.data).toEqual([]);

        const live = await new LibraryService(clientFor(role)).getPublishedArticle(
          ARTICLE_COMPLETE,
        );
        expect(live?.id).toBe(ARTICLE_COMPLETE);
      },
    );

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s writing either table directly",
      async (role) => {
        const intoDrafts = await clientFor(role)
          .from("library_articles")
          .insert({ category: "learning" });
        expect(intoDrafts.error?.code).toBe("42501");

        const intoDraftVersions = await clientFor(role)
          .from("library_article_translations")
          .update({ title: `Hijacked by ${role}` })
          .eq("article_id", ARTICLE_COMPLETE);
        expect(intoDraftVersions.error?.code).toBe("42501");

        const intoLive = await clientFor(role)
          .from("library_article_publications")
          .update({ category: "learning" })
          .eq("article_id", ARTICLE_COMPLETE);
        expect(intoLive.error?.code).toBe("42501");

        const intoLiveVersions = await clientFor(role)
          .from("library_article_publication_translations")
          .update({ title: `Hijacked by ${role}` })
          .eq("article_id", ARTICLE_COMPLETE);
        expect(intoLiveVersions.error?.code).toBe("42501");
      },
    );

    it("refuses even an admin writing the tables directly — the RPCs are the only way in", async () => {
      const { error } = await adminAuth
        .from("library_article_publications")
        .delete()
        .eq("article_id", ARTICLE_COMPLETE);
      expect(error?.code).toBe("42501");

      const versions = await adminAuth
        .from("library_article_publication_translations")
        .delete()
        .eq("article_id", ARTICLE_COMPLETE);
      expect(versions.error?.code).toBe("42501");
    });
  });

  // -------------------------------------------------------------------------
  // Covers from the catalogue
  // -------------------------------------------------------------------------

  describe("covers from the image catalogue", () => {
    /** Both copies' links and paths, read past RLS. */
    async function covers() {
      const draft = await admin
        .from("library_articles")
        .select("cover_image_id, cover_path")
        .eq("id", ARTICLE_COMPLETE)
        .single();
      const live = await admin
        .from("library_article_publications")
        .select("cover_image_id, cover_path, published_at")
        .eq("article_id", ARTICLE_COMPLETE)
        .maybeSingle();
      return { draft: draft.data, live: live.data };
    }

    it("publishes an article without a cover, which the public reads as none", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        coverImageId: null,
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      const live = await new LibraryService(anon).getPublishedArticle(
        ARTICLE_COMPLETE,
      );
      expect(live).toMatchObject({ id: ARTICLE_COMPLETE, coverPath: null });
    });

    it("hands anon the live cover's path without the catalogue itself", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);

      const live = await new LibraryService(anon).getPublishedArticle(
        ARTICLE_COMPLETE,
      );
      expect(live?.coverPath).toBe(pathOf(COVER_A));

      const catalogue = await anon.from("catalogue_images").select("id").in("id", ENTRIES);
      expect(catalogue.data ?? []).toEqual([]);
    });

    it("repoints draft and live covers alike, with no republish", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      const before = await covers();

      const { data: moved, error } = await adminAuth.rpc("repoint_library_covers", {
        p_from: COVER_A,
        p_to: COVER_B,
      });
      expect(error).toBeNull();
      // The working and the live copy both moved, and they are one article.
      expect(moved).toBe(1);

      const after = await covers();
      expect(after.draft).toEqual({
        cover_image_id: COVER_B,
        cover_path: pathOf(COVER_B),
      });
      expect(after.live).toMatchObject({
        cover_image_id: COVER_B,
        cover_path: pathOf(COVER_B),
      });
      expect(after.live?.published_at).toBe(before.live?.published_at);

      const adminView = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(adminView?.hasUnpublishedChanges).toBe(false);
    });

    it("repoints a live cover the working copy has already moved away from", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        coverImageId: COVER_DOOMED,
      });

      const { data: moved } = await adminAuth.rpc("repoint_library_covers", {
        p_from: COVER_A,
        p_to: COVER_B,
      });
      expect(moved).toBe(1);

      const after = await covers();
      expect(after.draft?.cover_image_id).toBe(COVER_DOOMED);
      expect(after.live?.cover_image_id).toBe(COVER_B);
    });

    it("refuses to repoint covers at a product picture, moving nothing", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);

      const { error } = await adminAuth.rpc("repoint_library_covers", {
        p_from: COVER_A,
        p_to: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");

      const after = await covers();
      expect(after.draft?.cover_image_id).toBe(COVER_A);
      expect(after.live?.cover_image_id).toBe(COVER_A);
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s repointing covers",
      async (role) => {
        await reseed();
        const { error } = await clientFor(role).rpc("repoint_library_covers", {
          p_from: COVER_A,
          p_to: COVER_B,
        });
        expect(error?.code).toBe("42501");
        expect((await covers()).draft?.cover_image_id).toBe(COVER_A);
      },
    );

    it("clears draft and live covers when their entry leaves the catalogue", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        coverImageId: COVER_DOOMED,
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      const { error } = await admin
        .from("catalogue_images")
        .delete()
        .eq("id", COVER_DOOMED);
      expect(error).toBeNull();

      const after = await covers();
      expect(after.draft).toEqual({ cover_image_id: null, cover_path: null });
      expect(after.live).toMatchObject({ cover_image_id: null, cover_path: null });
    });
  });

  // -------------------------------------------------------------------------
  // Partial writes: one version, or one field, at a time
  // -------------------------------------------------------------------------

  describe("partial writes", () => {
    /** The working copy's shared fields and versions, read past RLS. */
    async function workingCopy(id: string) {
      const article = await admin
        .from("library_articles")
        .select("category, cover_image_id, cover_path, updated_at")
        .eq("id", id)
        .single();
      const versions = await admin
        .from("library_article_translations")
        .select("locale, title, summary, body")
        .eq("article_id", id)
        .order("locale");
      return { ...article.data, versions: versions.data };
    }

    it("writes one language and leaves every other version, the category and the cover alone", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        versions: [EN, FI],
      });
      const before = await workingCopy(ARTICLE_COMPLETE);

      await service.saveArticleVersion(ARTICLE_COMPLETE, {
        locale: "fi",
        title: "  Fixture: uusi otsikko  ",
        summary: "Uusi tiivistelmä.",
        body: "Uusi kappale.",
      });

      const after = await workingCopy(ARTICLE_COMPLETE);
      expect(after.versions).toEqual([
        EN,
        {
          locale: "fi",
          title: "Fixture: uusi otsikko",
          summary: "Uusi tiivistelmä.",
          body: "Uusi kappale.",
        },
      ]);
      expect(after.category).toBe("screen_time");
      expect(after.cover_image_id).toBe(COVER_A);
      expect(after.cover_path).toBe(pathOf(COVER_A));
      expect(Date.parse(after.updated_at ?? "")).toBeGreaterThan(
        Date.parse(before.updated_at ?? ""),
      );
    });

    it("adds a language the article did not have", async () => {
      await reseed();

      await service.saveArticleVersion(ARTICLE_DRAFT, {
        locale: "sv",
        title: "Fixture: ett utkast",
        summary: "",
        body: "",
      });

      const after = await workingCopy(ARTICLE_DRAFT);
      expect(after.versions?.map((version) => version.locale)).toEqual(["en", "sv"]);
    });

    it("never touches the published copy", async () => {
      await reseed();
      await service.publishArticle(ARTICLE_COMPLETE);

      await service.saveArticleVersion(ARTICLE_COMPLETE, {
        ...EN,
        title: "Fixture: retitled in the working copy",
      });
      await service.setArticleCategory(ARTICLE_COMPLETE, "games_explained");
      await service.setArticleCover(ARTICLE_COMPLETE, COVER_B);

      const view = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(view?.publication).toMatchObject({
        category: "screen_time",
        coverPath: pathOf(COVER_A),
        versions: [{ locale: "en", title: EN.title }],
      });
      expect(view?.hasUnpublishedChanges).toBe(true);
    });

    it("refuses a version with a blank title, naming the language and writing nothing", async () => {
      await reseed();
      const before = await workingCopy(ARTICLE_DRAFT);

      const { error } = await adminAuth.rpc("save_library_article_version", {
        p_id: ARTICLE_DRAFT,
        p_locale: "fi",
        p_title: "   ",
        p_summary: "Tiivistelmä.",
        p_body: "",
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain("fi");

      expect(await workingCopy(ARTICLE_DRAFT)).toEqual(before);
    });

    it("refuses each partial write to an id no article has", async () => {
      await expect(
        service.saveArticleVersion(ARTICLE_MISSING, { ...EN }),
      ).rejects.toMatchObject({ code: "P0002" });
      await expect(
        service.setArticleCategory(ARTICLE_MISSING, "screen_time"),
      ).rejects.toMatchObject({ code: "P0002" });
      await expect(
        service.setArticleCover(ARTICLE_MISSING, COVER_A),
      ).rejects.toMatchObject({ code: "P0002" });

      const { data } = await admin
        .from("library_article_translations")
        .select("article_id")
        .eq("article_id", ARTICLE_MISSING);
      expect(data).toEqual([]);
    });

    it("sets the category alone, and clears it with null", async () => {
      await reseed();
      const before = await workingCopy(ARTICLE_COMPLETE);

      await service.setArticleCategory(ARTICLE_COMPLETE, "games_explained");
      const set = await workingCopy(ARTICLE_COMPLETE);
      expect(set.category).toBe("games_explained");
      expect(set.cover_image_id).toBe(COVER_A);
      expect(set.versions).toEqual(before.versions);

      await service.setArticleCategory(ARTICLE_COMPLETE, null);
      expect((await workingCopy(ARTICLE_COMPLETE)).category).toBeNull();
    });

    it("sets the cover alone, deriving its path, and clears both with null", async () => {
      await reseed();

      await service.setArticleCover(ARTICLE_COMPLETE, COVER_B);
      const set = await workingCopy(ARTICLE_COMPLETE);
      expect(set.cover_image_id).toBe(COVER_B);
      expect(set.cover_path).toBe(pathOf(COVER_B));
      expect(set.category).toBe("screen_time");

      await service.setArticleCover(ARTICLE_COMPLETE, null);
      const cleared = await workingCopy(ARTICLE_COMPLETE);
      expect(cleared.cover_image_id).toBeNull();
      expect(cleared.cover_path).toBeNull();
    });

    it("refuses a product picture as a cover, keeping the one there", async () => {
      await reseed();

      await expect(
        service.setArticleCover(ARTICLE_COMPLETE, PRODUCT_PICTURE),
      ).rejects.toMatchObject({ code: "23514" });

      expect((await workingCopy(ARTICLE_COMPLETE)).cover_image_id).toBe(COVER_A);
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s every partial write with a payload an admin would succeed with",
      async (role) => {
        await reseed();
        const before = await workingCopy(ARTICLE_COMPLETE);

        const version = await clientFor(role).rpc("save_library_article_version", {
          p_id: ARTICLE_COMPLETE,
          p_locale: "en",
          p_title: `Renamed by ${role}`,
          p_summary: "",
          p_body: "",
        });
        expect(version.error?.code).toBe("42501");

        const category = await clientFor(role).rpc("set_library_article_category", {
          p_id: ARTICLE_COMPLETE,
          p_category: "games_explained",
        });
        expect(category.error?.code).toBe("42501");

        const cover = await clientFor(role).rpc("set_library_article_cover", {
          p_id: ARTICLE_COMPLETE,
          p_cover_image_id: COVER_B,
        });
        expect(cover.error?.code).toBe("42501");

        expect(await workingCopy(ARTICLE_COMPLETE)).toEqual(before);
      },
    );
  });

  // -------------------------------------------------------------------------
  // Who last saved the working copy, and through which AI app
  // -------------------------------------------------------------------------

  describe("the last saver", () => {
    const APP_NAME = "Fixture AI app";
    let grant: OAuthGrant;
    /** The admin acting through the AI app's token, as an MCP tool does. */
    let viaApp: LibraryService;
    let adminName: string;

    beforeAll(async () => {
      grant = await oauthGrantFor(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
        APP_NAME,
      );
      viaApp = new LibraryService(createBearerTestClient(grant.accessToken));
      const { data } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", TEST_IDS.ADMIN)
        .single();
      adminName = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim();
    });

    afterAll(async () => {
      await revokeOAuthGrant(grant.clientId);
    });

    async function saver(id: string) {
      const { data } = await admin
        .from("library_articles")
        .select("last_saved_by, last_saved_via")
        .eq("id", id)
        .single();
      return data;
    }

    it("records the admin and no app for a save in Sogverse", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, completeInput());

      expect(await saver(ARTICLE_COMPLETE)).toEqual({
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: null,
      });
      const view = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(view?.draft.lastSavedBy).toBe(adminName);
      expect(view?.draft.lastSavedVia).toBeNull();
    });

    it("records the AI app a save came through, and names it to the admin read", async () => {
      await reseed();
      await viaApp.saveArticleVersion(ARTICLE_COMPLETE, {
        ...EN,
        title: "Fixture: written by an app",
      });

      expect(await saver(ARTICLE_COMPLETE)).toEqual({
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: grant.clientId,
      });
      const view = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(view?.draft.lastSavedBy).toBe(adminName);
      expect(view?.draft.lastSavedVia).toEqual({
        clientId: grant.clientId,
        name: APP_NAME,
      });
    });

    it("stamps every writer, and a later save in Sogverse clears the app", async () => {
      await reseed();

      await viaApp.setArticleCategory(ARTICLE_COMPLETE, "games_explained");
      expect((await saver(ARTICLE_COMPLETE))?.last_saved_via).toBe(grant.clientId);

      await service.setArticleCover(ARTICLE_COMPLETE, COVER_B);
      expect(await saver(ARTICLE_COMPLETE)).toEqual({
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: null,
      });

      const mintedId = await viaApp.createArticle({
        versions: [{ locale: "en", title: "Fixture: created by an app", summary: "", body: "" }],
        category: null,
        coverImageId: null,
      });
      minted.push(mintedId);
      expect(await saver(mintedId)).toEqual({
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: grant.clientId,
      });
    });

    it("leaves the record alone on a publish, which saves nothing", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_COMPLETE, completeInput());

      await viaApp.publishArticle(ARTICLE_COMPLETE);

      expect((await saver(ARTICLE_COMPLETE))?.last_saved_via).toBeNull();
    });

    it("records no saver for a write with no signed-in caller, whatever the statement says", async () => {
      await reseed();
      await viaApp.saveArticleVersion(ARTICLE_COMPLETE, { ...EN });

      const { error } = await admin
        .from("library_articles")
        .update({
          category: "games_explained",
          last_saved_by: TEST_IDS.ADMIN,
          last_saved_via: grant.clientId,
        })
        .eq("id", ARTICLE_COMPLETE);
      expect(error).toBeNull();

      expect(await saver(ARTICLE_COMPLETE)).toEqual({
        last_saved_by: null,
        last_saved_via: null,
      });
      const view = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(view?.draft.lastSavedBy).toBeNull();
      expect(view?.draft.lastSavedVia).toBeNull();
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s reading an OAuth client",
      async (role) => {
        const { error } = await clientFor(role).rpc("get_oauth_client", {
          p_id: grant.clientId,
        });
        expect(error?.code).toBe("42501");
      },
    );
  });
});

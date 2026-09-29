import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import type { CatalogueImageInsert } from "@/types";
import { LibraryService } from "@/services/library/library.service";

/**
 * The Library: `library_articles` (an article's admin-only working copy),
 * `library_article_publications` (its public published copy, whose row
 * existing IS the article being live), their four admin-guarded writers, and
 * covers: a link from either copy to a library_cover entry of the shared image
 * catalogue, the trigger that derives each copy's `cover_path` from it, and
 * `repoint_library_covers`, the catalogue replace's half for the Library.
 *
 * Neither table carries a write grant for any Data API role, so there is no
 * write-IDOR case to make: a non-admin's direct write is refused at the grant,
 * which is asserted here once per table. The spine sweeps the four RPCs with
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

/** A complete working copy, as the table stores it. */
function completeRow() {
  return {
    title: "Fixture: screen time that adds up",
    summary: "A standfirst.",
    body: "## A heading\n\nA paragraph.",
    category: "screen_time" as const,
    cover_image_id: COVER_A,
  };
}

/** The same working copy, as the service takes it. */
function completeInput() {
  const { cover_image_id, ...row } = completeRow();
  return {
    ...row,
    category: "screen_time" as const,
    coverImageId: cover_image_id as string | null,
  };
}

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
      { id: ARTICLE_COMPLETE, ...completeRow() },
      // Every column spelled out: a multi-row insert sends the union of the
      // rows' keys, so an omitted one arrives as an explicit NULL rather than
      // taking its default.
      {
        id: ARTICLE_DRAFT,
        title: "Fixture: an unfinished draft",
        summary: "",
        body: "",
        category: null,
        cover_image_id: null,
      },
    ]);
    expect(error).toBeNull();
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
        title: "  Fixture: minted  ",
        summary: "",
        body: "",
        category: null,
        coverImageId: null,
      });
      minted.push(id);

      const { data: row } = await admin
        .from("library_articles")
        .select("title, summary, body, category, cover_image_id, cover_path, author_id")
        .eq("id", id)
        .single();
      const { data: me } = await adminAuth.auth.getUser();
      expect(row).toEqual({
        title: "Fixture: minted",
        summary: "",
        body: "",
        category: null,
        cover_image_id: null,
        cover_path: null,
        author_id: me.user?.id,
      });
    });

    it("refuses a draft with no title, with a readable check_violation", async () => {
      const { error } = await adminAuth.rpc("create_library_article", {
        p_title: "   ",
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/title/);
    });

    it("derives the cover path from the linked entry, and clears it with the link", async () => {
      await reseed();
      await service.saveArticle(ARTICLE_DRAFT, {
        title: "Fixture: an unfinished draft",
        summary: "",
        body: "",
        category: null,
        coverImageId: COVER_B,
      });
      const linked = await service.getAdminArticle(ARTICLE_DRAFT);
      expect(linked?.draft).toMatchObject({
        coverImageId: COVER_B,
        coverPath: pathOf(COVER_B),
      });

      await service.saveArticle(ARTICLE_DRAFT, {
        title: "Fixture: an unfinished draft",
        summary: "",
        body: "",
        category: null,
        coverImageId: null,
      });
      const cleared = await service.getAdminArticle(ARTICLE_DRAFT);
      expect(cleared?.draft).toMatchObject({ coverImageId: null, coverPath: null });
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
        p_title: "T",
        p_cover_image_id: PRODUCT_PICTURE,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/library_cover/);
    });

    it("refuses a cover that is no longer in the catalogue", async () => {
      const { error } = await adminAuth.rpc("save_library_article", {
        p_id: ARTICLE_DRAFT,
        p_title: "T",
        p_cover_image_id: ARTICLE_MISSING,
      });
      expect(error?.code).toBe("23503");
    });

    it("refuses to save an id no article has", async () => {
      await expect(
        service.saveArticle(ARTICLE_MISSING, {
          title: "T",
          summary: "",
          body: "",
          category: null,
          coverImageId: null,
        }),
      ).rejects.toMatchObject({ code: "P0002" });
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s creating or saving with a payload an admin would succeed with",
      async (role) => {
        const created = await clientFor(role).rpc("create_library_article", {
          p_title: `Fixture: by ${role}`,
        });
        expect(created.error?.code).toBe("42501");

        const saved = await clientFor(role).rpc("save_library_article", {
          p_id: ARTICLE_DRAFT,
          p_title: `Renamed by ${role}`,
        });
        expect(saved.error?.code).toBe("42501");

        const { data: row } = await admin
          .from("library_articles")
          .select("title")
          .eq("id", ARTICLE_DRAFT)
          .single();
        expect(row?.title).toBe("Fixture: an unfinished draft");
      },
    );
  });

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  describe("publish and unpublish", () => {
    it("refuses an incomplete working copy, naming everything missing", async () => {
      await reseed();
      await expect(service.publishArticle(ARTICLE_DRAFT)).rejects.toMatchObject({
        code: "23514",
        message: expect.stringMatching(/summary.*body.*category/),
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
        title: completeRow().title,
        category: "screen_time",
        coverPath: pathOf(COVER_A),
      });
      expect(live?.firstPublishedAt).toBe(live?.publishedAt);

      const afterPublish = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(afterPublish?.hasUnpublishedChanges).toBe(false);

      await service.saveArticle(ARTICLE_COMPLETE, {
        ...completeInput(),
        category: "learning",
        title: "Fixture: edited, not yet live",
        body: "A different body.",
      });

      expect(await service.getPublishedArticle(ARTICLE_COMPLETE)).toEqual(live);

      const edited = await service.getAdminArticle(ARTICLE_COMPLETE);
      expect(edited?.draft.title).toBe("Fixture: edited, not yet live");
      expect(edited?.draft.category).toBe("learning");
      expect(edited?.publication).toEqual(live);
      expect(edited?.hasUnpublishedChanges).toBe(true);

      const listed = (await service.listAdminArticles()).find(
        (item) => item.id === ARTICLE_COMPLETE,
      );
      expect(listed).toMatchObject({
        title: "Fixture: edited, not yet live",
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
        body: `${completeRow().body} One more sentence.`,
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
        title: "Fixture: second version",
        coverImageId: COVER_B,
      });
      await service.publishArticle(ARTICLE_COMPLETE);

      const second = await service.getPublishedArticle(ARTICLE_COMPLETE);
      expect(second?.title).toBe("Fixture: second version");
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
        title: completeRow().title,
        coverImageId: COVER_A,
        category: "screen_time",
      });

      await expect(
        service.unpublishArticle(ARTICLE_COMPLETE),
      ).resolves.toBeUndefined();
    });

    it("refuses a published copy with a blank field at the schema itself", async () => {
      // The backstop behind publish's own refusal: a row arriving any other way
      // still cannot put a blank on a public page.
      const { error } = await admin.from("library_article_publications").insert({
        article_id: ARTICLE_DRAFT,
        category: "learning",
        title: "T",
        summary: "   ",
        body: "B",
        cover_image_id: COVER_A,
        published_at: new Date().toISOString(),
        first_published_at: new Date().toISOString(),
      });
      expect(error?.code).toBe("23514");
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
      await service.publishArticle(ARTICLE_COMPLETE);
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
          .insert({ title: `Fixture: direct by ${role}` });
        expect(intoDrafts.error?.code).toBe("42501");

        const intoLive = await clientFor(role)
          .from("library_article_publications")
          .update({ title: `Hijacked by ${role}` })
          .eq("article_id", ARTICLE_COMPLETE);
        expect(intoLive.error?.code).toBe("42501");
      },
    );

    it("refuses even an admin writing either table directly — the RPCs are the only way in", async () => {
      const { error } = await adminAuth
        .from("library_article_publications")
        .delete()
        .eq("article_id", ARTICLE_COMPLETE);
      expect(error?.code).toBe("42501");
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
});

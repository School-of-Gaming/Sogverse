import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import type { CatalogueImageInsert } from "@/types";
import { SpotlightsService } from "@/services/spotlights/spotlights.service";
import type { SpotlightVersionInput } from "@/services/spotlights/spotlights.contracts";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";

/**
 * Spotlights: `spotlights` (the picture and the enabled switch) and
 * `spotlight_translations` (a title and a body per locale), their
 * admin-guarded writers, the CHECK that no spotlight is enabled without a
 * picture, the image catalogue's replace and removal reaching them — a removal
 * switching a spotlight off with its picture — and the session report email's
 * read of the enabled ones, newest first.
 *
 * Neither table carries a write grant for any Data API role, so there is no
 * write-IDOR case to make: a non-admin's direct write is refused at the grant,
 * which is asserted here once per table. The spine sweeps the RPCs with
 * all-NULL arguments; each wrong role is tried here with a payload an admin
 * would succeed with, so the refusal is shown to be about the role.
 *
 * Fixture UUIDs 850-855 (see the allocation registry in product-helpers.ts).
 * Every assertion is scoped to this file's own rows.
 */

/** A spotlight id that must NEVER exist. */
const SPOTLIGHT_MISSING = "00000000-0000-0000-0000-000000000850";

/** Spotlight pictures. */
const PIC_A = "00000000-0000-0000-0000-000000000851";
const PIC_B = "00000000-0000-0000-0000-000000000852";
const PIC_C = "00000000-0000-0000-0000-000000000853";
/** A picture removed during the run, taking its spotlights' pictures with it. */
const PIC_DOOMED = "00000000-0000-0000-0000-000000000854";
/** A Library cover — a purpose a spotlight may not show. */
const COVER = "00000000-0000-0000-0000-000000000855";
const ENTRIES = [PIC_A, PIC_B, PIC_C, PIC_DOOMED, COVER];

/** A valid catalogue hash, 64 lowercase hex characters, from an 8-char seed. */
const hex = (seed: string): string => seed.repeat(8);

const ENTRY_ROWS: CatalogueImageInsert[] = [
  { id: PIC_A, label: "Spotlight fixture A", sha256: hex("5a5a8510"), path: `${hex("5a5a8510")}.jpg`, purpose: "spotlight_image" },
  { id: PIC_B, label: "Spotlight fixture B", sha256: hex("5b5b8520"), path: `${hex("5b5b8520")}.jpg`, purpose: "spotlight_image" },
  { id: PIC_C, label: "Spotlight fixture C", sha256: hex("5c5c8530"), path: `${hex("5c5c8530")}.jpg`, purpose: "spotlight_image" },
  { id: PIC_DOOMED, label: "Spotlight fixture doomed", sha256: hex("5d5d8540"), path: `${hex("5d5d8540")}.jpg`, purpose: "spotlight_image" },
  { id: COVER, label: "Spotlight fixture cover", sha256: hex("5e5e8550"), path: `${hex("5e5e8550")}.jpg`, purpose: "library_cover" },
];

const pathOf = (entry: string): string | undefined =>
  ENTRY_ROWS.find((row) => row.id === entry)?.path;

const EN = {
  locale: "en" as const,
  title: "Fixture: winter camp",
  body: "Join us. [Read more](/shop).",
};
const FI = { locale: "fi" as const, title: "Fixture: talvileiri", body: "Tule mukaan." };

/** Every spotlight minted during the run, deleted at the end. */
const minted: string[] = [];

describe("spotlights", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let service: SpotlightsService;

  async function cleanUp() {
    if (minted.length > 0) {
      await admin.from("spotlights").delete().in("id", minted);
    }
    await admin.from("catalogue_images").delete().in("id", ENTRIES);
  }

  async function mint(
    imageId: string | null,
    versions: SpotlightVersionInput[] = [EN],
    enabled = false,
  ): Promise<string> {
    const id = await service.createSpotlight({ versions, imageId, enabled });
    minted.push(id);
    return id;
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
    service = new SpotlightsService(adminAuth);
    await cleanUp();
  });

  beforeEach(async () => {
    await cleanUp();
    minted.length = 0;
    const { error } = await admin.from("catalogue_images").insert(ENTRY_ROWS);
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await cleanUp();
  });

  describe("create and save", () => {
    it("creates a spotlight as asked — here switched off — with its versions trimmed and its picture's path derived", async () => {
      const id = await mint(PIC_A, [
        { locale: "fi", title: "  Fixture: talvileiri  ", body: " Tule mukaan. " },
        EN,
      ]);

      const spotlight = await service.getAdminSpotlight(id);
      expect(spotlight).toMatchObject({
        id,
        enabled: false,
        imageId: PIC_A,
        imagePath: pathOf(PIC_A),
        imageLabel: "Spotlight fixture A",
        // SUPPORTED_LOCALES order, whatever order they were sent in.
        versions: [EN, FI],
      });
    });

    it("refuses a spotlight with no version, and a version missing its title or its body, creating nothing", async () => {
      const none = await adminAuth.rpc("create_spotlight", {
        p_versions: [],
        p_enabled: false,
      });
      expect(none.error?.code).toBe("23514");
      expect(none.error?.message).toMatch(/at least one language version/);

      const untitled = await adminAuth.rpc("create_spotlight", {
        p_versions: [{ locale: "fi", title: "  ", body: "Fixture: never created" }],
        p_enabled: false,
      });
      expect(untitled.error?.code).toBe("23514");
      expect(untitled.error?.message).toMatch(/fi version needs a title/);

      const bodiless = await adminAuth.rpc("create_spotlight", {
        p_versions: [{ locale: "en", title: "Fixture: never created", body: "" }],
        p_enabled: false,
      });
      expect(bodiless.error?.code).toBe("23514");
      expect(bodiless.error?.message).toMatch(/en version needs a body/);

      const { count } = await admin
        .from("spotlight_translations")
        .select("spotlight_id", { count: "exact", head: true })
        .or("title.eq.Fixture: never created,body.eq.Fixture: never created");
      expect(count).toBe(0);
    });

    it("refuses a save that would leave no version, keeping the stored ones", async () => {
      const id = await mint(null, [EN, FI]);

      const { error } = await adminAuth.rpc("save_spotlight", {
        p_id: id,
        p_versions: [],
        p_enabled: false,
      });
      expect(error?.code).toBe("23514");

      expect((await service.getAdminSpotlight(id))?.versions).toEqual([EN, FI]);
    });

    it("replaces the version set whole: a language left out is removed", async () => {
      const id = await mint(PIC_A, [EN, FI]);

      await service.saveSpotlight(id, {
        versions: [FI],
        imageId: PIC_B,
        enabled: false,
      });

      expect(await service.getAdminSpotlight(id)).toMatchObject({
        versions: [FI],
        imageId: PIC_B,
        imagePath: pathOf(PIC_B),
      });
    });

    it("refuses a picture of another purpose, and an id no spotlight has", async () => {
      const cover = await adminAuth.rpc("create_spotlight", {
        p_versions: [EN],
        p_enabled: false,
        p_image_id: COVER,
      });
      expect(cover.error?.code).toBe("23514");
      expect(cover.error?.message).toMatch(/spotlight_image/);

      const missing = await adminAuth.rpc("save_spotlight", {
        p_id: SPOTLIGHT_MISSING,
        p_versions: [EN],
        p_enabled: false,
      });
      expect(missing.error?.code).toBe("P0002");
    });
  });

  describe("enabled needs a picture", () => {
    it("refuses creating a spotlight switched on with no picture, creating nothing", async () => {
      const { error } = await adminAuth.rpc("create_spotlight", {
        p_versions: [{ ...EN, title: "Fixture: never created" }],
        p_enabled: true,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs a picture/);

      const { count } = await admin
        .from("spotlight_translations")
        .select("spotlight_id", { count: "exact", head: true })
        .eq("title", "Fixture: never created");
      expect(count).toBe(0);
    });

    it("creates a spotlight switched on when it has a picture", async () => {
      const id = await mint(PIC_A, [EN], true);
      expect((await service.getAdminSpotlight(id))?.enabled).toBe(true);
    });

    it("refuses a save switching on a spotlight with no picture, keeping it as it was", async () => {
      const id = await mint(null);

      const { error } = await adminAuth.rpc("save_spotlight", {
        p_id: id,
        p_versions: [FI],
        p_enabled: true,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs a picture/);
      expect(await service.getAdminSpotlight(id)).toMatchObject({
        enabled: false,
        versions: [EN],
      });
    });

    it("holds the rule in the schema, whoever writes", async () => {
      const id = await mint(null);

      // The service role passes every grant and policy, and still meets the CHECK.
      const { error } = await admin
        .from("spotlights")
        .update({ enabled: true })
        .eq("id", id);
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/chk_spotlights_enabled_has_image/);
    });

    it("refuses clearing the picture of a spotlight the save keeps on", async () => {
      const id = await mint(PIC_A, [EN], true);

      const { error } = await adminAuth.rpc("save_spotlight", {
        p_id: id,
        p_versions: [EN],
        p_enabled: true,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toMatch(/needs a picture/);
      expect(await service.getAdminSpotlight(id)).toMatchObject({
        enabled: true,
        imageId: PIC_A,
      });
    });

    it("judges one save on its final state: switching off and clearing the picture together, or adding one and switching on", async () => {
      const id = await mint(PIC_A, [EN], true);

      await service.saveSpotlight(id, {
        versions: [EN],
        imageId: null,
        enabled: false,
      });
      expect(await service.getAdminSpotlight(id)).toMatchObject({
        enabled: false,
        imageId: null,
        imagePath: null,
        imageLabel: null,
      });

      await service.saveSpotlight(id, {
        versions: [EN],
        imageId: PIC_B,
        enabled: true,
      });
      expect(await service.getAdminSpotlight(id)).toMatchObject({
        enabled: true,
        imageId: PIC_B,
        imagePath: pathOf(PIC_B),
      });
    });
  });

  describe("the image catalogue", () => {
    it("a removal takes the picture off every spotlight showing it and switches each off", async () => {
      const on = await mint(PIC_DOOMED, [EN], true);
      const off = await mint(PIC_DOOMED);
      const elsewhere = await mint(PIC_A, [EN], true);

      // The admin's own session removes catalogue rows, as the route does.
      const { error } = await adminAuth
        .from("catalogue_images")
        .delete()
        .eq("id", PIC_DOOMED);
      expect(error).toBeNull();

      for (const id of [on, off]) {
        expect(await service.getAdminSpotlight(id)).toMatchObject({
          enabled: false,
          imageId: null,
          imagePath: null,
        });
      }
      expect(await service.getAdminSpotlight(elsewhere)).toMatchObject({
        enabled: true,
        imageId: PIC_A,
      });
    });

    it("a replace moves every spotlight on the entry, enabled ones staying on", async () => {
      const on = await mint(PIC_A, [EN], true);
      const off = await mint(PIC_A);

      const { data: moved, error } = await adminAuth.rpc(
        "repoint_spotlight_images",
        { p_from: PIC_A, p_to: PIC_B },
      );
      expect(error).toBeNull();
      expect(moved).toBe(2);

      expect(await service.getAdminSpotlight(on)).toMatchObject({
        enabled: true,
        imageId: PIC_B,
        imagePath: pathOf(PIC_B),
      });
      expect(await service.getAdminSpotlight(off)).toMatchObject({
        enabled: false,
        imageId: PIC_B,
      });
    });

    it("a replace refuses an entry of another purpose", async () => {
      await mint(PIC_A);
      const { error } = await adminAuth.rpc("repoint_spotlight_images", {
        p_from: PIC_A,
        p_to: COVER,
      });
      expect(error?.code).toBe("23514");
    });
  });

  describe("the session report email's read", () => {
    it("returns only the enabled spotlights, newest first, with every version and the picture's URL and stored size", async () => {
      const oldest = await mint(PIC_A, [EN, FI], true);
      const disabled = await mint(PIC_B);
      const newest = await mint(PIC_C, [EN], true);
      const tieA = await mint(PIC_A, [EN], true);
      const tieB = await mint(PIC_B, [EN], true);

      // Creation times set apart by hand, two of them equal so the id decides.
      const stamps: [string, string][] = [
        [oldest, "2026-01-01T09:00:00Z"],
        [disabled, "2026-03-01T09:00:00Z"],
        [tieA, "2026-02-01T09:00:00Z"],
        [tieB, "2026-02-01T09:00:00Z"],
        [newest, "2026-04-01T09:00:00Z"],
      ];
      for (const [id, created_at] of stamps) {
        const { error } = await admin.from("spotlights").update({ created_at }).eq("id", id);
        expect(error).toBeNull();
      }

      const read = await new SpotlightsService(admin).listEnabledSpotlights();
      const ours = read.filter((spotlight) => minted.includes(spotlight.id));

      const [tieFirst, tieSecond] = [tieA, tieB].sort().reverse();
      expect(ours.map((spotlight) => spotlight.id)).toEqual([
        newest,
        tieFirst,
        tieSecond,
        oldest,
      ]);

      const { width, height } = CATALOGUE_IMAGE_PURPOSES.spotlight_image;
      expect(ours.at(-1)).toEqual({
        id: oldest,
        versions: [EN, FI],
        image: {
          url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/spotlight-images/${pathOf(PIC_A)}`,
          width,
          height,
        },
        createdAt: expect.any(String),
      });
    });
  });

  describe("delete", () => {
    it("removes a spotlight and its versions, leaving its picture in the catalogue", async () => {
      const id = await mint(PIC_A, [EN, FI]);

      await service.deleteSpotlight(id);

      expect(await service.getAdminSpotlight(id)).toBeNull();
      const { count } = await admin
        .from("spotlight_translations")
        .select("spotlight_id", { count: "exact", head: true })
        .eq("spotlight_id", id);
      expect(count).toBe(0);
      const { data: picture } = await admin
        .from("catalogue_images")
        .select("id")
        .eq("id", PIC_A)
        .maybeSingle();
      expect(picture).not.toBeNull();

      const again = await adminAuth.rpc("delete_spotlight", { p_id: id });
      expect(again.error?.code).toBe("P0002");
    });
  });

  describe("only admins", () => {
    it.each(["customer", "gedu", "gamer"] as const)(
      "refuses every writer to a %s, with a payload an admin would succeed with",
      async (role) => {
        const id = await mint(PIC_A);
        const client = role === "customer" ? customer : role === "gedu" ? gedu : gamer;

        const calls = [
          client.rpc("create_spotlight", {
            p_versions: [EN],
            p_enabled: true,
            p_image_id: PIC_A,
          }),
          client.rpc("save_spotlight", {
            p_id: id,
            p_versions: [FI],
            p_enabled: true,
            p_image_id: PIC_A,
          }),
          client.rpc("repoint_spotlight_images", { p_from: PIC_A, p_to: PIC_B }),
          client.rpc("delete_spotlight", { p_id: id }),
        ];
        for (const { error } of await Promise.all(calls)) {
          expect(error?.code).toBe("42501");
        }

        expect(await service.getAdminSpotlight(id)).toMatchObject({
          enabled: false,
          imageId: PIC_A,
          versions: [EN],
        });
      },
    );

    it("lets no non-admin read either table, and no Data API role write one", async () => {
      const id = await mint(PIC_A, [EN], true);

      for (const client of [customer, gedu, gamer, anon]) {
        const spotlights = await client.from("spotlights").select("id").eq("id", id);
        expect(spotlights.data ?? []).toEqual([]);
        const versions = await client
          .from("spotlight_translations")
          .select("spotlight_id")
          .eq("spotlight_id", id);
        expect(versions.data ?? []).toEqual([]);
      }

      // Not even an admin's own session holds a write grant.
      const insert = await adminAuth.from("spotlights").insert({});
      expect(insert.error?.code).toBe("42501");
      const translation = await adminAuth
        .from("spotlight_translations")
        .insert({ spotlight_id: id, locale: "sv", title: "T", body: "B" });
      expect(translation.error?.code).toBe("42501");
    });
  });
});

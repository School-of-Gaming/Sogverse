import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  callRpcRaw,
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
  createBearerTestClient,
  oauthGrantFor,
  revokeOAuthGrant,
  type OAuthGrant,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  HOME_SPOT_SIZE,
  QUOTATION_MARKS,
  homeTestimonialRows,
  type TestimonialVersionInput,
} from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";

/**
 * Testimonials: `testimonials` (who created and last saved each),
 * `testimonial_translations` (whom it is from and the quote, per locale) and
 * `home_testimonials` (which testimonial fills which home spot, written only
 * by migrations), their admin-guarded writers, and the public read.
 *
 * Pinned here: anon reads only the placed testimonials, through
 * `list_home_testimonials` — the scope test the authorization spine names —
 * and every caller gets the same answer; a quote in quotation marks is
 * refused by the writers and by the table, mark by mark, and the apostrophes
 * are not; no role and no function deletes a testimonial, and the foreign
 * key restricts a hand delete of a placed one; a spot holds at most its
 * size; and the trigger stamps who created and last saved it, and through
 * which AI app.
 *
 * The migrations fill the six home positions with the site's own quotes, and
 * every assertion about them reads what is there rather than assuming it.
 * The testimonials this file creates are found by a quote prefix only it uses
 * and removed at the end on the service role, the one role that may. Fixture UUID 900 (product-helpers.ts registry).
 */

/** A testimonial id that must NEVER exist. */
const MISSING = "00000000-0000-0000-0000-000000000900";

/** Every quote this file writes starts with it, so cleanup finds them all. */
const PREFIX = "Fixture testimonial:";

const EN = { locale: "en" as const, from: "Fixture parent", quote: `${PREFIX} it is great` };
const FI = { locale: "fi" as const, from: "Fixture vanhempi", quote: `${PREFIX} se on hieno` };

const payload = (versions: { locale: string; from: string; quote: string }[]) =>
  versions.map(({ locale, from, quote }) => ({ locale, attribution: from, quote }));

describe("testimonials", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let others: Record<"customer" | "gedu" | "gamer", SupabaseClient<Database>>;
  let anon: SupabaseClient<Database>;
  let service: TestimonialsService;

  async function cleanUp() {
    const { data } = await admin
      .from("testimonial_translations")
      .select("testimonial_id")
      .like("quote", `${PREFIX}%`);
    const ids = [...new Set((data ?? []).map((row) => row.testimonial_id))];
    if (ids.length > 0) {
      await admin.from("home_testimonials").delete().in("testimonial_id", ids);
      await admin.from("testimonials").delete().in("id", ids);
    }
  }

  async function mint(versions: TestimonialVersionInput[] = [EN]): Promise<string> {
    return service.createTestimonial({ versions });
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    others = {
      customer: await createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      gedu: await createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password,
      ),
      gamer: await createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
    };
    anon = createAnonTestClient();
    service = new TestimonialsService(adminAuth);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // The public read
  // -------------------------------------------------------------------------

  describe("the public read", () => {
    it("shows anon exactly the placed testimonials, with their words alone", async () => {
      const unplaced = await mint([EN, FI]);

      const { data, error } = await anon.rpc("list_home_testimonials");
      expect(error).toBeNull();
      const rows = homeTestimonialRows.parse(data);

      const { data: placements } = await admin
        .from("home_testimonials")
        .select("testimonial_id");
      expect(rows.map((row) => row.testimonial_id).sort()).toEqual(
        (placements ?? []).map((row) => row.testimonial_id).sort(),
      );
      expect(rows.some((row) => row.testimonial_id === unplaced)).toBe(false);

      // Nothing about who keeps the store: each version is its words alone.
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(["position", "spot", "testimonial_id", "versions"]);
        for (const version of row.versions) {
          expect(Object.keys(version).sort()).toEqual(["attribution", "locale", "quote"]);
        }
      }
    });

    it("answers every signed-in role exactly as it answers anon", async () => {
      const asAnon = await anon.rpc("list_home_testimonials");
      for (const client of [adminAuth, ...Object.values(others)]) {
        const asRole = await client.rpc("list_home_testimonials");
        expect(asRole.error).toBeNull();
        expect(asRole.data).toEqual(asAnon.data);
      }
    });

    it("carries the six home page quotes the migration moved in, every locale written and no quotation marks", async () => {
      const home = await new TestimonialsService(anon).listHomeTestimonials();
      expect(home.feature).toHaveLength(HOME_SPOT_SIZE.feature);
      expect(home.safety).toHaveLength(HOME_SPOT_SIZE.safety);
      expect(home.row).toHaveLength(HOME_SPOT_SIZE.row);
      for (const testimonial of [...home.feature, ...home.safety, ...home.row]) {
        expect(testimonial.versions.map((version) => version.locale)).toEqual([
          "en",
          "fi",
          "sv",
          "fr",
          "tlh",
        ]);
      }
      expect(home.feature[0].versions[0]).toMatchObject({
        from: "Mum, Finland",
        quote: expect.stringMatching(/^The club is the highlight of my son’s week\..*surprised me\.$/),
      });
    });

    it("keeps the store itself from anon, and from every role but an admin", async () => {
      for (const table of ["testimonials", "testimonial_translations", "home_testimonials"] as const) {
        const { error } = await anon.from(table).select("*").limit(1);
        expect(error?.code).toBe("42501");
      }
      const unplaced = await mint();
      for (const client of Object.values(others)) {
        const { data, error } = await client.from("testimonials").select("id").eq("id", unplaced);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      expect((await service.getAdminTestimonial(unplaced))?.id).toBe(unplaced);
    });
  });

  // -------------------------------------------------------------------------
  // The writers
  // -------------------------------------------------------------------------

  describe("writing", () => {
    it("creates and saves through the admin's writers, versions trimmed and in locale order", async () => {
      const id = await mint([{ ...FI, quote: `  ${FI.quote}  ` }, EN]);
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN, FI]);

      await service.saveTestimonial(id, { versions: [FI] });
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([FI]);

      await service.saveTestimonialVersion(id, EN);
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN, FI]);

      await service.removeTestimonialVersion(id, "fi");
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN]);
    });

    it("refuses removing the last version, and a testimonial with none", async () => {
      const id = await mint();
      const last = await adminAuth.rpc("remove_testimonial_version", { p_id: id, p_locale: "en" });
      expect(last.error?.code).toBe("23514");
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN]);

      const none = await adminAuth.rpc("create_testimonial", { p_versions: [] });
      expect(none.error?.code).toBe("23514");
    });

    it("refuses a version missing whom it is from or its quote", async () => {
      const unattributed = await adminAuth.rpc("create_testimonial", {
        p_versions: [{ locale: "en", attribution: " ", quote: `${PREFIX} never created` }],
      });
      expect(unattributed.error?.code).toBe("23514");
      expect(unattributed.error?.message).toMatch(/en version needs to say whom/);

      const id = await mint();
      const unquoted = await adminAuth.rpc("save_testimonial_version", {
        p_id: id,
        p_locale: "fi",
        p_attribution: "Äiti",
        p_quote: "",
      });
      expect(unquoted.error?.code).toBe("23514");
    });

    it("refuses every quotation mark the app names, at either end, in the writers and in the table", async () => {
      const id = await mint();
      for (const mark of QUOTATION_MARKS) {
        for (const quote of [`${mark}${PREFIX} marked`, `${PREFIX} marked${mark}`]) {
          const { error } = await adminAuth.rpc("save_testimonial_version", {
            p_id: id,
            p_locale: "fi",
            p_attribution: "Äiti",
            p_quote: quote,
          });
          expect(error?.code, `writer, ${quote}`).toBe("23514");
          expect(error?.message).toMatch(/Leave the marks out/);

          const direct = await admin
            .from("testimonial_translations")
            .insert({ testimonial_id: id, locale: "sv", attribution: "Mamma", quote });
          expect(direct.error?.code, `table, ${quote}`).toBe("23514");
        }
      }
    });

    it("keeps the apostrophes, which start and end words", async () => {
      const id = await mint();
      await service.saveTestimonialVersion(id, {
        locale: "tlh",
        from: "SoS",
        quote: `’ej ${PREFIX} Qapla’`,
      });
      expect((await service.getAdminTestimonial(id))?.versions).toContainEqual({
        locale: "tlh",
        from: "SoS",
        quote: `’ej ${PREFIX} Qapla’`,
      });
    });

    it("refuses every writer to every role but an admin, with a payload an admin would succeed with", async () => {
      const id = await mint();
      for (const client of Object.values(others)) {
        const created = await client.rpc("create_testimonial", { p_versions: payload([EN]) });
        expect(created.error?.code).toBe("42501");
        const saved = await client.rpc("save_testimonial", { p_id: id, p_versions: payload([FI]) });
        expect(saved.error?.code).toBe("42501");
      }
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN]);
    });

    it("grants no role a direct write, the home spots included", async () => {
      const id = await mint();
      const testimonial = await adminAuth.from("testimonials").insert({});
      expect(testimonial.error?.code).toBe("42501");
      const translation = await adminAuth
        .from("testimonial_translations")
        .insert({ testimonial_id: id, locale: "fi", attribution: "Äiti", quote: `${PREFIX} direct` });
      expect(translation.error?.code).toBe("42501");
      const placement = await adminAuth
        .from("home_testimonials")
        .update({ testimonial_id: id })
        .eq("spot", "feature");
      expect(placement.error?.code).toBe("42501");
    });

    it("answers an id no testimonial has as not found", async () => {
      const { error } = await adminAuth.rpc("save_testimonial", {
        p_id: MISSING,
        p_versions: payload([EN]),
      });
      expect(error?.code).toBe("P0002");
    });
  });

  // -------------------------------------------------------------------------
  // Deleting, and the home spots
  // -------------------------------------------------------------------------

  describe("keeping testimonials, and the home spots", () => {
    it("lets no role delete a testimonial, and no function exists to", async () => {
      const id = await mint([EN, FI]);
      for (const client of [adminAuth, ...Object.values(others), anon]) {
        const { error } = await client.from("testimonials").delete().eq("id", id);
        expect(error?.code).toBe("42501");
      }
      const { data: session } = await adminAuth.auth.getSession();
      const rpc = await callRpcRaw(session.session?.access_token ?? "", "delete_testimonial", {
        p_id: id,
      });
      expect(rpc.code).toBe("PGRST202");
      expect((await service.getAdminTestimonial(id))?.versions).toEqual([EN, FI]);
    });

    it("restricts a hand delete of a placed testimonial", async () => {
      const { data: placement } = await admin
        .from("home_testimonials")
        .select("testimonial_id")
        .eq("spot", "safety")
        .eq("position", 1)
        .single();
      expect(placement).not.toBeNull();
      const placed = placement?.testimonial_id ?? MISSING;

      const raw = await admin.from("testimonials").delete().eq("id", placed);
      expect(raw.error?.code).toBe("23503");

      expect((await service.getAdminTestimonial(placed))?.usages).toEqual([
        { kind: "home", spot: "safety", position: 1 },
      ]);
    });

    it("holds each spot to its size, from position one", async () => {
      const id = await mint();
      for (const [spot, position] of [
        ["feature", 2],
        ["safety", 3],
        ["row", 4],
        ["row", 0],
      ] as const) {
        const { error } = await admin
          .from("home_testimonials")
          .insert({ spot, position, testimonial_id: id });
        expect(error?.code, `${spot} ${position}`).toBe("23514");
      }
    });

    it("shows a testimonial in one home position at most", async () => {
      const { data: placement } = await admin
        .from("home_testimonials")
        .select("spot, position, testimonial_id")
        .eq("spot", "row")
        .eq("position", 3)
        .single();
      expect(placement).not.toBeNull();
      if (placement === null) return;

      // Free the last row position for the length of the case, then put it back.
      await admin.from("home_testimonials").delete().eq("spot", "row").eq("position", 3);
      try {
        const { data: other } = await admin
          .from("home_testimonials")
          .select("testimonial_id")
          .eq("spot", "feature")
          .single();
        const { error } = await admin
          .from("home_testimonials")
          .insert({ spot: "row", position: 3, testimonial_id: other?.testimonial_id ?? MISSING });
        expect(error?.code).toBe("23505");
      } finally {
        const restored = await admin.from("home_testimonials").insert(placement);
        expect(restored.error).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Who created it and who last saved it
  // -------------------------------------------------------------------------

  describe("the record", () => {
    const APP_NAME = "Fixture testimonial app";
    let grant: OAuthGrant;
    let viaApp: TestimonialsService;

    beforeAll(async () => {
      grant = await oauthGrantFor(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
        APP_NAME,
      );
      viaApp = new TestimonialsService(createBearerTestClient(grant.accessToken));
    });

    afterAll(async () => {
      await revokeOAuthGrant(grant);
    });

    async function record(id: string) {
      const { data } = await admin
        .from("testimonials")
        .select("created_at, created_by, created_via, updated_at, last_saved_by, last_saved_via")
        .eq("id", id)
        .single();
      return data;
    }

    it("stamps the creator in Sogverse, then a save through an AI app, keeping who created it", async () => {
      const id = await mint();
      const created = await record(id);
      expect(created).toMatchObject({
        created_by: TEST_IDS.ADMIN,
        created_via: null,
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: null,
      });

      await viaApp.saveTestimonialVersion(id, FI);
      const saved = await record(id);
      expect(saved).toMatchObject({
        created_at: created?.created_at,
        created_by: TEST_IDS.ADMIN,
        created_via: null,
        last_saved_by: TEST_IDS.ADMIN,
        last_saved_via: grant.clientId,
      });
      expect(Date.parse(saved?.updated_at ?? "")).toBeGreaterThanOrEqual(
        Date.parse(created?.updated_at ?? ""),
      );

      const read = await service.getAdminTestimonial(id);
      expect(read?.lastSaved.via).toEqual({ clientId: grant.clientId, name: APP_NAME });
      expect(read?.created.via).toBeNull();
    });

    it("stamps an AI app's create as the creator's app", async () => {
      const id = await viaApp.createTestimonial({ versions: [EN] });
      expect(await record(id)).toMatchObject({
        created_by: TEST_IDS.ADMIN,
        created_via: grant.clientId,
      });
    });

    it("records no creator for a write with no signed-in caller, as the migration's quotes show", async () => {
      const { data: placements } = await admin.from("home_testimonials").select("testimonial_id");
      const ids = (placements ?? []).map((row) => row.testimonial_id);
      const { data } = await admin
        .from("testimonials")
        .select("created_by, created_via, last_saved_by, last_saved_via")
        .in("id", ids);
      expect(data).toHaveLength(ids.length);
      for (const row of data ?? []) {
        expect(row).toEqual({
          created_by: null,
          created_via: null,
          last_saved_by: null,
          last_saved_via: null,
        });
      }
    });
  });
});

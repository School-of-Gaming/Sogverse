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
  QUOTATION_MARKS,
  type TestimonialVersionInput,
} from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";

/**
 * Testimonials: `testimonials` (who created and last saved each) and
 * `testimonial_translations` (whom it is from and the quote, per locale), and
 * their admin-guarded writers.
 *
 * Pinned here: the store is an admin's alone — anon reads nothing and every
 * other role reads no row; a quote in quotation marks is refused by the
 * writers and by the table, mark by mark, and the apostrophes are not; no
 * role and no function deletes a testimonial; and the trigger stamps who
 * created and last saved it, and through which AI app.
 *
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
  // Reading
  // -------------------------------------------------------------------------

  describe("reading", () => {
    it("keeps the store itself from anon, and from every role but an admin", async () => {
      for (const table of ["testimonials", "testimonial_translations"] as const) {
        const { error } = await anon.from(table).select("*").limit(1);
        expect(error?.code).toBe("42501");
      }
      const id = await mint();
      for (const client of Object.values(others)) {
        const { data, error } = await client.from("testimonials").select("id").eq("id", id);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
      expect((await service.getAdminTestimonial(id))?.id).toBe(id);
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

    it("grants no role a direct write", async () => {
      const id = await mint();
      const testimonial = await adminAuth.from("testimonials").insert({});
      expect(testimonial.error?.code).toBe("42501");
      const translation = await adminAuth
        .from("testimonial_translations")
        .insert({ testimonial_id: id, locale: "fi", attribution: "Äiti", quote: `${PREFIX} direct` });
      expect(translation.error?.code).toBe("42501");
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
  // Deleting
  // -------------------------------------------------------------------------

  describe("keeping testimonials", () => {
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

    it("records no creator for a write with no signed-in caller", async () => {
      const { data: inserted, error } = await admin
        .from("testimonials")
        .insert({})
        .select("id")
        .single();
      expect(error).toBeNull();
      const id = inserted?.id ?? MISSING;
      // A version with the file's prefix, so the cleanup finds it.
      await admin
        .from("testimonial_translations")
        .insert({ testimonial_id: id, locale: "en", attribution: EN.from, quote: EN.quote });

      expect(await record(id)).toMatchObject({
        created_by: null,
        created_via: null,
        last_saved_by: null,
        last_saved_via: null,
      });
    });
  });
});

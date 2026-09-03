import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * `calendar_feed_sandboxes` — one admin's editable fake family, standing behind
 * a calendar-feed URL.
 *
 * The table carries one FOR ALL policy that checks both halves at once, so the
 * cases below are the cross-product worth proving: an admin over their own row
 * (everything works), an admin over somebody else's (nothing does — that half
 * is the write-IDOR case in write-idor.test.ts), and a non-admin over any row
 * at all. The last one matters most: `authenticated` holds all four grants on
 * this table, so the policy is the entire distance between a signed-in parent
 * and an admin's scratchpad.
 *
 * The write-side attempts assert **zero rows affected** rather than an error,
 * because RLS refuses a write by filtering it away rather than by raising.
 */

const OTHER_OWNER_ROW = "00000000-0000-0000-0000-000000000639";

/** A minimal document — the table's CHECK asks only that it be an object. */
const DOCUMENT = { parent: { firstName: "Sandbox fixture" } };

describe("calendar feed sandboxes", () => {
  let admin: SupabaseClient<Database>;
  let adminClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let geduClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
  });

  beforeEach(async () => {
    // The admin's sandbox is unique per owner, so every case starts from none.
    await admin
      .from("calendar_feed_sandboxes")
      .delete()
      .eq("owner_id", TEST_IDS.ADMIN);
    await admin.from("calendar_feed_sandboxes").delete().eq("id", OTHER_OWNER_ROW);
    await admin.from("calendar_feed_sandboxes").insert({
      id: OTHER_OWNER_ROW,
      owner_id: TEST_IDS.CUSTOMER_2,
      definition: DOCUMENT,
    });
  });

  afterAll(async () => {
    await admin
      .from("calendar_feed_sandboxes")
      .delete()
      .eq("owner_id", TEST_IDS.ADMIN);
    await admin.from("calendar_feed_sandboxes").delete().eq("id", OTHER_OWNER_ROW);
  });

  describe("the owning admin", () => {
    it("creates, reads, edits and removes their own sandbox", async () => {
      const { data: created, error: insertError } = await adminClient
        .from("calendar_feed_sandboxes")
        .insert({ owner_id: TEST_IDS.ADMIN, definition: DOCUMENT })
        .select("id")
        .single();
      expect(insertError).toBeNull();
      expect(created).not.toBeNull();

      const { data: read } = await adminClient
        .from("calendar_feed_sandboxes")
        .select("id, owner_id")
        .eq("owner_id", TEST_IDS.ADMIN);
      expect(read).toHaveLength(1);

      const { data: updated } = await adminClient
        .from("calendar_feed_sandboxes")
        .update({ definition: { parent: { firstName: "Edited" } } })
        .eq("owner_id", TEST_IDS.ADMIN)
        .select("id");
      expect(updated).toHaveLength(1);

      const { data: removed } = await adminClient
        .from("calendar_feed_sandboxes")
        .delete()
        .eq("owner_id", TEST_IDS.ADMIN)
        .select("id");
      expect(removed).toHaveLength(1);
    });

    /**
     * The read half of the same clause the write-IDOR case covers. An admin who
     * could *read* a colleague's sandbox could also mint its feed token, which
     * is the whole authorization on the feed route.
     */
    it("cannot read another owner's sandbox", async () => {
      const { data } = await adminClient
        .from("calendar_feed_sandboxes")
        .select("id")
        .eq("id", OTHER_OWNER_ROW);
      expect(data).toEqual([]);
    });

    /** WITH CHECK: the target half, refusing a row aimed at somebody else. */
    it("cannot create a sandbox owned by anybody else", async () => {
      const { error } = await adminClient
        .from("calendar_feed_sandboxes")
        .insert({ owner_id: TEST_IDS.CUSTOMER_2, definition: DOCUMENT });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    });
  });

  describe("a non-admin", () => {
    it("reads nothing at all, own row or not", async () => {
      // Seeded through the service-role client so the row exists to be missed.
      await admin.from("calendar_feed_sandboxes").insert({
        owner_id: TEST_IDS.ADMIN,
        definition: DOCUMENT,
      });

      for (const client of [customerClient, geduClient]) {
        const { data } = await client
          .from("calendar_feed_sandboxes")
          .select("id");
        expect(data).toEqual([]);
      }
    });

    it("cannot create a sandbox for themselves", async () => {
      const { error } = await customerClient
        .from("calendar_feed_sandboxes")
        .insert({ owner_id: TEST_IDS.CUSTOMER, definition: DOCUMENT });
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("cannot edit or remove an admin's sandbox", async () => {
      const { data: seeded } = await admin
        .from("calendar_feed_sandboxes")
        .insert({ owner_id: TEST_IDS.ADMIN, definition: DOCUMENT })
        .select("id")
        .single();
      expect(seeded).not.toBeNull();

      const { data: updated } = await customerClient
        .from("calendar_feed_sandboxes")
        .update({ definition: { parent: { firstName: "Defaced" } } })
        .eq("owner_id", TEST_IDS.ADMIN)
        .select("id");
      expect(updated).toEqual([]);

      const { data: removed } = await customerClient
        .from("calendar_feed_sandboxes")
        .delete()
        .eq("owner_id", TEST_IDS.ADMIN)
        .select("id");
      expect(removed).toEqual([]);

      const { data: survivor } = await admin
        .from("calendar_feed_sandboxes")
        .select("definition")
        .eq("owner_id", TEST_IDS.ADMIN)
        .maybeSingle();
      expect(survivor?.definition).toEqual(DOCUMENT);
    });
  });

  describe("the stored document", () => {
    it("refuses anything that is not a JSON object", async () => {
      const { error } = await admin.from("calendar_feed_sandboxes").insert({
        id: "00000000-0000-0000-0000-00000000063a",
        owner_id: TEST_IDS.GEDU,
        definition: ["not", "an", "object"],
      });
      expect(error?.code).toBe("23514");
    });

    it("holds at most one sandbox per owner", async () => {
      await admin.from("calendar_feed_sandboxes").insert({
        owner_id: TEST_IDS.ADMIN,
        definition: DOCUMENT,
      });
      const { error } = await admin.from("calendar_feed_sandboxes").insert({
        owner_id: TEST_IDS.ADMIN,
        definition: DOCUMENT,
      });
      expect(error?.code).toBe("23505");
    });

    it("stamps updated_at on a change", async () => {
      const { data: created } = await admin
        .from("calendar_feed_sandboxes")
        .insert({ owner_id: TEST_IDS.ADMIN, definition: DOCUMENT })
        .select("id, updated_at")
        .single();
      expect(created).not.toBeNull();

      const { data: touched } = await admin
        .from("calendar_feed_sandboxes")
        .update({ definition: { parent: { firstName: "Edited" } } })
        .eq("owner_id", TEST_IDS.ADMIN)
        .select("updated_at")
        .single();

      expect(
        new Date(touched?.updated_at ?? 0).getTime(),
      ).toBeGreaterThanOrEqual(new Date(created?.updated_at ?? 0).getTime());
    });
  });
});

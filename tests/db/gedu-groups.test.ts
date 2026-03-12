import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS, SEED } from "./constants";

describe("get_gedu_groups RPC", () => {
  let geduClient: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  beforeAll(async () => {
    geduClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
  });

  it("returns groups for the authenticated gedu", async () => {
    const { data, error } = await geduClient.rpc("get_gedu_groups");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);

    // Find the seeded group
    const seededRow = data!.find((r) => r.group_id === TEST_IDS.GROUP);
    expect(seededRow).toBeDefined();
    expect(seededRow!.product_id).toBe(TEST_IDS.PRODUCT);
    expect(seededRow!.product_name).toBe(SEED.PRODUCT_NAME);
  });

  it("includes enrolled gamers in the result", async () => {
    const { data, error } = await geduClient.rpc("get_gedu_groups");

    expect(error).toBeNull();

    // The seeded enrollment links TEST_IDS.GAMER to TEST_IDS.GROUP
    const gamerRow = data!.find(
      (r) => r.group_id === TEST_IDS.GROUP && r.gamer_id === TEST_IDS.GAMER,
    );
    expect(gamerRow).toBeDefined();
    expect(gamerRow!.enrollment_id).toBe(TEST_IDS.ENROLLMENT);
  });

  it("rejects non-gedu roles", async () => {
    const { error: gamerError } = await gamerClient.rpc("get_gedu_groups");
    expect(gamerError).not.toBeNull();

    const { error: customerError } = await customerClient.rpc("get_gedu_groups");
    expect(customerError).not.toBeNull();
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The location tree never holds a loop, so the one way to climb it always ends
 * at a country.
 *
 * `location_lineage` is what every reader climbs the tree with, and
 * `trg_locations_refuse_loop` is what keeps the climb finite: a place may not
 * be put under anything below it.
 */
describe("location_lineage", () => {
  let service: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    service = createAdminTestClient();
    anon = createAnonTestClient();
    admin = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
  });

  async function lilleId(): Promise<string> {
    const { data, error } = await service
      .from("locations")
      .select("id")
      .eq("country_code", "FR")
      .eq("type", "municipality")
      .eq("external_code", "59350")
      .single();
    if (error) throw error;
    return data.id;
  }

  it("climbs from a place to its country, nearest first", async () => {
    const { data, error } = await service.rpc("location_lineage", {
      p_location_id: await lilleId(),
    });
    if (error) throw error;

    const ids = data.map((row) => row.location_id);
    const { data: places, error: placesError } = await service
      .from("locations")
      .select("id, type, parent_id")
      .in("id", ids);
    if (placesError) throw placesError;
    const byId = new Map(places.map((place) => [place.id, place]));

    expect(data.map((row) => row.distance)).toEqual(data.map((_, index) => index));
    expect(byId.get(ids[0])?.type).toBe("municipality");
    expect(byId.get(ids.at(-1)!)?.type).toBe("country");
    // Each step is the previous place's parent.
    for (let index = 1; index < ids.length; index++) {
      expect(byId.get(ids[index - 1])?.parent_id).toBe(ids[index]);
    }
  });

  it("answers an anonymous caller exactly as it answers the service role", async () => {
    // The scope test: it names no user and reads only a table every role
    // reads in full, so there is no per-caller answer to leak.
    const id = await lilleId();
    const fromAnon = await anon.rpc("location_lineage", { p_location_id: id });
    const fromService = await service.rpc("location_lineage", { p_location_id: id });

    expect(fromAnon.error).toBeNull();
    expect(fromAnon.data).toEqual(fromService.data);
  });

  it("is empty for an id no place has", async () => {
    const { data, error } = await anon.rpc("location_lineage", {
      p_location_id: "00000000-0000-0000-0000-00000000dead",
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  describe("re-parenting", () => {
    // Three throwaway places in a line, top → middle → bottom, written as an
    // admin through the Data API, which is how a place is moved in the app.
    const created: string[] = [];
    let top: string;
    let middle: string;
    let bottom: string;
    let elsewhere: string;

    async function place(name: string, parentId: string | null): Promise<string> {
      const { data, error } = await admin
        .from("locations")
        .insert({ name, type: "site", parent_id: parentId })
        .select("id")
        .single();
      if (error) throw error;
      created.push(data.id);
      return data.id;
    }

    beforeAll(async () => {
      top = await place("Loop test top", null);
      middle = await place("Loop test middle", top);
      bottom = await place("Loop test bottom", middle);
      elsewhere = await place("Loop test elsewhere", null);
    });

    afterAll(async () => {
      // Children before parents: the parent foreign key restricts deletes.
      for (const id of [...created].reverse()) {
        await service.from("locations").delete().eq("id", id);
      }
    });

    it("refuses a place moved under its own grandchild", async () => {
      const { error } = await admin
        .from("locations")
        .update({ parent_id: bottom })
        .eq("id", top);

      expect(error?.code).toBe("23514");
    });

    it("refuses a place moved under its own child", async () => {
      const { error } = await admin
        .from("locations")
        .update({ parent_id: middle })
        .eq("id", top);

      expect(error?.code).toBe("23514");
    });

    it("moves a place anywhere outside its own subtree", async () => {
      const { error } = await admin
        .from("locations")
        .update({ parent_id: elsewhere })
        .eq("id", bottom);
      expect(error).toBeNull();

      const { data, error: lineageError } = await service.rpc("location_lineage", {
        p_location_id: bottom,
      });
      if (lineageError) throw lineageError;
      expect(data.map((row) => row.location_id)).toEqual([bottom, elsewhere]);
    });
  });
});

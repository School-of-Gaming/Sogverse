import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * `get_my_family_product_feed` — the one read behind every family club, camp
 * and event page.
 *
 * This file settles two things that fail in different ways:
 *
 *   1. **Scope.** The function carries no role guard by design (see its entry in
 *      authorization-spine.test.ts), so nothing static vets it and this is the
 *      test the spine's completeness check points at. Its failure mode is
 *      answering about somebody else, and the sharp case is not an outsider —
 *      it is a SIBLING. GAMER and GAMER_2 share a parent and sit in the same
 *      group, so a naive "is the caller in this group" gate would let each read
 *      the other's page. The key is the participation, not the group.
 *   2. **The privacy line.** A family surface may never carry a gedu note of any
 *      scope, another child's name or marks, a parent email, the lesson-material
 *      link, or any completeness/owed state. The fixtures below deliberately
 *      populate every one of those on the staff side, so the assertions that
 *      they are absent from the family document cannot pass vacuously — which
 *      is the whole difficulty with testing an omission.
 *
 * Layout. PRODUCT_MINE is remote and runs seven days a week, so any date is a
 * legal session date; GAMER and GAMER_2 are both on GROUP_MINE's roster, both
 * children of CUSTOMER. PRODUCT_SITE is in-person, for the venue block.
 * PRODUCT_UNPLACED holds a purchased-but-ungrouped participation — the state
 * that has no page. CUSTOMER_2 is a parent of nobody, so they are the
 * different-family case.
 */

const PRODUCT_MINE = "00000000-0000-0000-0000-000000000607";
const PRODUCT_SITE = "00000000-0000-0000-0000-000000000608";
const PRODUCT_UNPLACED = "00000000-0000-0000-0000-000000000609";
const GROUP_MINE = "00000000-0000-0000-0000-00000000060a";
const GROUP_SITE = "00000000-0000-0000-0000-00000000060b";

const ALL_PRODUCTS = [PRODUCT_MINE, PRODUCT_SITE, PRODUCT_UNPLACED];

/** A participation id that belongs to nobody. */
const NO_SUCH_PARTICIPATION = "00000000-0000-0000-0000-0000000006ff";

/** `YYYY-MM-DD`, `offset` days from today. The fixture products run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const LONG_AGO = dayOffset(-40);
const YESTERDAY = dayOffset(-1);
const TWO_DAYS_AGO = dayOffset(-2);

const GEDU_NOTE = "PRIVATE-STAFF-NOTE-must-never-reach-a-family";
const MATERIAL_URL = "https://drive.sog.gg/PRIVATE-lesson-plans";

describe("family product feed", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let customer2Auth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  /** participations.id, filled in beforeAll once the rows exist. */
  let minePlaced = "";
  let siblingPlaced = "";
  let sitePlaced = "";
  let unplaced = "";

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Auth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, {
        id,
        seatCount: null,
        startDate: dayOffset(-60),
      });
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Family feed fixture",
        short_description: "Seeded by family-product-feed.test.ts",
      });
      // Every weekday, so any date in the run is a legal session date.
      for (let weekday = 0; weekday < 7; weekday++) {
        await createScheduleSlot(admin, id, {
          weekday,
          startTime: "17:00",
          durationMinutes: 90,
        });
      }
    }

    await admin
      .from("products")
      .update({ is_remote: false, location_id: TEST_IDS.LOCATION_SITE })
      .eq("id", PRODUCT_SITE);

    // The gedu-only lesson link, on the product the family reads. Seeded so
    // "the document does not carry material_url" is a claim about the RPC
    // rather than about an empty column.
    await admin.from("product_staff_details").upsert({
      product_id: PRODUCT_MINE,
      material_url: MATERIAL_URL,
    });

    await admin.from("product_groups").insert([
      {
        id: GROUP_MINE,
        product_id: PRODUCT_MINE,
        name: "Cohort Family",
        public_note: "Bring headphones every week.",
        gedu_note: GEDU_NOTE,
      },
      {
        id: GROUP_SITE,
        product_id: PRODUCT_SITE,
        name: "Cohort On Site",
        gedu_note: GEDU_NOTE,
      },
    ]);

    await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP_MINE, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_MINE },
      { group_id: GROUP_SITE, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_SITE },
    ]);

    // The venue: an admin writes the address, a gedu the two notes. Only the
    // family-facing pair may come back through this RPC.
    await admin.from("site_details").upsert({
      location_id: TEST_IDS.LOCATION_SITE,
      address: "Leppavaarankatu 9",
      notes: "Drop-off is at the main entrance.",
    });
    await admin.from("site_staff_details").upsert({
      location_id: TEST_IDS.LOCATION_SITE,
      notes: GEDU_NOTE,
    });

    // Two siblings in ONE group, plus a placement on the in-person product and
    // one purchased seat with no group at all.
    const { data: parts, error } = await admin
      .from("participations")
      .insert([
        {
          product_id: PRODUCT_MINE,
          group_id: GROUP_MINE,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
        {
          product_id: PRODUCT_MINE,
          group_id: GROUP_MINE,
          participant_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
        {
          product_id: PRODUCT_SITE,
          group_id: GROUP_SITE,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
        {
          product_id: PRODUCT_UNPLACED,
          group_id: null,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
      ])
      .select("id, product_id, participant_id, group_id");
    expect(error).toBeNull();

    const find = (productId: string, gamerId: string) => {
      const row = (parts ?? []).find(
        (p) => p.product_id === productId && p.participant_id === gamerId,
      );
      if (!row) throw new Error(`fixture participation missing: ${productId}`);
      return row.id;
    };
    minePlaced = find(PRODUCT_MINE, TEST_IDS.GAMER);
    siblingPlaced = find(PRODUCT_MINE, TEST_IDS.GAMER_2);
    sitePlaced = find(PRODUCT_SITE, TEST_IDS.GAMER);
    unplaced = find(PRODUCT_UNPLACED, TEST_IDS.GAMER);

    // Three sessions of stored history on GROUP_MINE, seeded directly rather
    // than through the gedu write RPCs: this file tests the read, and direct
    // inserts sidestep the write validator's horizon and past-only rules so the
    // history can stretch back beyond a child's enrolment.
    const { data: sessions } = await admin
      .from("group_sessions")
      .insert(
        [LONG_AGO, TWO_DAYS_AGO, YESTERDAY].map((date) => ({
          group_id: GROUP_MINE,
          session_date: date,
          starts_at: `${date}T17:00:00.000Z`,
          ends_at: `${date}T18:30:00.000Z`,
          report: `Report for ${date}`,
          gedu_note: GEDU_NOTE,
        })),
      )
      .select("id, session_date");

    const sessionOn = (date: string) => {
      const row = (sessions ?? []).find((s) => s.session_date === date);
      if (!row) throw new Error(`fixture session missing: ${date}`);
      return row.id;
    };

    // The two siblings get DIFFERENT answers on the SAME session — the only way
    // to prove each document carries its own child's mark rather than the
    // group's map.
    await admin.from("session_attendance").insert([
      {
        session_id: sessionOn(YESTERDAY),
        participant_id: TEST_IDS.GAMER,
        status: "present",
      },
      {
        session_id: sessionOn(YESTERDAY),
        participant_id: TEST_IDS.GAMER_2,
        status: "absent",
      },
      // TWO_DAYS_AGO is marked for the sibling only, so the first child's
      // answer there is the unmarked third state rather than a stored value.
      {
        session_id: sessionOn(TWO_DAYS_AGO),
        participant_id: TEST_IDS.GAMER_2,
        status: "present",
      },
    ]);
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin
      .from("site_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
    await admin
      .from("site_staff_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
  });

  // -------------------------------------------------------------------------
  // 1. The document, parsed against real Postgres output
  // -------------------------------------------------------------------------

  describe("the document", () => {
    it("hands the gamer their own page, parsed through the contract schema", async () => {
      const { data, error } = await gamerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      expect(error).toBeNull();

      const feed = familyProductFeed.parse(data);

      expect(feed.gamer.id).toBe(TEST_IDS.GAMER);
      expect(feed.gamer.first_name).toBeTruthy();
      expect(feed.group.id).toBe(GROUP_MINE);
      expect(feed.group.name).toBe("Cohort Family");
      expect(feed.group.public_note).toContain("headphones");
      expect(feed.product.id).toBe(PRODUCT_MINE);
      expect(feed.product.schedule_slots).toHaveLength(7);
      expect(feed.product.translations[0]?.name).toBe("Family feed fixture");
      // Remote product: no building, so no venue block at all.
      expect(feed.site).toBeNull();
      expect(feed.gedus.map((g) => g.id)).toEqual([TEST_IDS.GEDU]);
    });

    it("hands a linked parent the same page", async () => {
      const asGamer = await gamerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      const asParent = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });

      expect(asParent.error).toBeNull();
      // Byte-identical: the parent and the child read one page, and any future
      // per-role trimming has to be a deliberate change to this expectation.
      expect(familyProductFeed.parse(asParent.data)).toEqual(
        familyProductFeed.parse(asGamer.data),
      );
    });

    it("carries the venue on an in-person product", async () => {
      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: sitePlaced,
      });
      const feed = familyProductFeed.parse(data);

      expect(feed.site?.location_id).toBe(TEST_IDS.LOCATION_SITE);
      expect(feed.site?.name).toBeTruthy();
      expect(feed.site?.address).toBe("Leppavaarankatu 9");
      expect(feed.site?.public_note).toContain("main entrance");
    });
  });

  // -------------------------------------------------------------------------
  // 2. History and attendance
  // -------------------------------------------------------------------------

  describe("history", () => {
    it("returns the group's full stored history, newest first, unwindowed", async () => {
      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      const feed = familyProductFeed.parse(data);

      expect(feed.sessions.map((s) => s.session_date)).toEqual([
        YESTERDAY,
        TWO_DAYS_AGO,
        LONG_AGO,
      ]);
      // Every report is reachable — the decision this RPC's no-paging rule
      // exists to protect. A session that renders as "no write-up" while a
      // report exists is the regression to look for.
      for (const session of feed.sessions) {
        expect(session.report).toBe(`Report for ${session.session_date}`);
        expect(session.starts_at).toBeTruthy();
        expect(session.ends_at).toBeTruthy();
      }
    });

    it("carries the named gamer's own mark and never the sibling's", async () => {
      const mine = familyProductFeed.parse(
        (
          await customerAuth.rpc("get_my_family_product_feed", {
            p_participation_id: minePlaced,
          })
        ).data,
      );
      const sibling = familyProductFeed.parse(
        (
          await customerAuth.rpc("get_my_family_product_feed", {
            p_participation_id: siblingPlaced,
          })
        ).data,
      );

      const markOn = (feed: typeof mine, date: string) =>
        feed.sessions.find((s) => s.session_date === date)?.attendance;

      // Same session, same parent, two participations, two different answers.
      expect(markOn(mine, YESTERDAY)).toBe("present");
      expect(markOn(sibling, YESTERDAY)).toBe("absent");

      // Unmarked is null — a third state, not "absent". The sibling was marked
      // on this date and this child was not.
      expect(markOn(mine, TWO_DAYS_AGO)).toBeNull();
      expect(markOn(sibling, TWO_DAYS_AGO)).toBe("present");

      // And neither document mentions the other child at all.
      expect(JSON.stringify(mine)).not.toContain(TEST_IDS.GAMER_2);
      expect(JSON.stringify(sibling)).not.toContain(TEST_IDS.GAMER);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The privacy line
  // -------------------------------------------------------------------------

  describe("the privacy line", () => {
    it("carries no staff-only field, with every one of them populated upstream", async () => {
      // Non-vacuity first: prove the staff side really does hold what we are
      // about to assert is absent. Without this the assertions below would pass
      // just as happily against empty columns.
      const { data: staff } = await admin
        .from("group_sessions")
        .select("gedu_note")
        .eq("group_id", GROUP_MINE)
        .limit(1)
        .single();
      expect(staff?.gedu_note).toBe(GEDU_NOTE);

      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      const document = JSON.stringify(data);

      // The note text itself, wherever it was stored — session, group or site.
      expect(document).not.toContain(GEDU_NOTE);
      // And the key names, so a future field that is merely empty today still
      // fails this test rather than sliding in.
      expect(document).not.toContain("gedu_note");
      expect(document).not.toContain("material_url");
      expect(document).not.toContain(MATERIAL_URL);
      // No roster, no other family's address, no staff workload vocabulary.
      expect(document).not.toContain("roster");
      expect(document).not.toContain("parent_email");
      expect(document).not.toContain("attention");
      // The seeded accounts' emails are all @test.local; a parent email
      // arriving anywhere in this document would carry one.
      expect(document).not.toContain("@test.local");
    });

    it("keeps the gedu note on the in-person venue block", async () => {
      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: sitePlaced,
      });
      const feed = familyProductFeed.parse(data);

      // The site block is present and populated — so its lack of a staff note
      // is the RPC's choice of columns, not an absent join.
      expect(feed.site?.public_note).toContain("main entrance");
      expect(JSON.stringify(feed)).not.toContain(GEDU_NOTE);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Refusals — the scope claim
  // -------------------------------------------------------------------------

  describe("refusals", () => {
    it("refuses a parent of a different family", async () => {
      const { data, error } = await customer2Auth.rpc(
        "get_my_family_product_feed",
        { p_participation_id: minePlaced },
      );

      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    });

    it("refuses the gamer of a different participation, sibling or not", async () => {
      // GAMER_2 shares a parent with GAMER and sits in the SAME group, which is
      // what makes this the sharp case: a gate written against the group rather
      // than the participation would let this through.
      const gamer2Auth = await createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER_2.email,
        TEST_CREDENTIALS.GAMER_2.password,
      );

      const { error } = await gamer2Auth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      expect(error?.code).toBe("42501");

      // Their own participation, in that same group, is fine — so the refusal
      // above is about whose row it is, not about the group being unreachable.
      const own = await gamer2Auth.rpc("get_my_family_product_feed", {
        p_participation_id: siblingPlaced,
      });
      expect(own.error).toBeNull();
    });

    it("refuses an unplaced participation as not-found, for its own owners", async () => {
      // Not an authorization failure — this parent owns the row. There is
      // simply no page: no group means no feed, no gedus and no group note.
      //
      // P0002 (`no_data_found`) specifically, not merely "some error that isn't
      // 42501": PostgREST maps P0002 to a 404 and P0001 to a 400, and the club
      // page is specified to render this case as not-found. A bare RAISE would
      // be P0001 and would surface as a client error the page has no state for,
      // so the code is the contract and this asserts it.
      for (const client of [customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_my_family_product_feed", {
          p_participation_id: unplaced,
        });
        expect(error?.code).toBe("P0002");
      }
    });

    it("answers a nonexistent participation exactly as it answers someone else's", async () => {
      // Identical replies, so the function cannot be used as an oracle for
      // "is this a real enrollment id".
      const missing = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: NO_SUCH_PARTICIPATION,
      });
      const theirs = await customer2Auth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });

      expect(missing.error?.code).toBe("42501");
      expect(missing.error?.message).toBe(theirs.error?.message);
    });

    it("refuses staff: neither the assigned gedu nor an admin has a family page", async () => {
      // Both can read this group's data — through the gedu workspace and the
      // service-role client respectively. Neither is a party to the family
      // enrollment, and this RPC answers only to parties.
      for (const client of [geduAuth, adminAuth]) {
        const { error } = await client.rpc("get_my_family_product_feed", {
          p_participation_id: minePlaced,
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("is not reachable without a session", async () => {
      const { error } = await anon.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      // No grant to `anon` — refused at the privilege layer, before the body.
      expect(error).not.toBeNull();
    });

    it("refuses the service-role client, which has EXECUTE but no identity", async () => {
      // The regression pin for 00152. `service_role` keeps its grant, so this
      // call reaches the function body — and a service-role JWT carries no
      // `sub`, so auth.uid() is NULL inside it. Until 00152 that made the
      // ownership predicate evaluate to NULL, which PL/pgSQL reads as false,
      // so the guard never fired and the FULL family document came back for an
      // arbitrary participation id: a complete cross-family read for any
      // server-side caller that passed through a URL-supplied id.
      //
      // `minePlaced` is a real, placed participation, which is what makes this
      // non-vacuous: with a nonexistent id the not-found arm raises either way
      // and a broken function would pass this test.
      const { data, error } = await admin.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });

      expect(error?.code).toBe("42501");
      expect(data).toBeNull();
    });
  });
});

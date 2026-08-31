import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
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

/**
 * The shape of `get_my_family_product_feed_v2`'s document, naming only what
 * 00222 added and letting everything else through untouched.
 *
 * Deliberately NOT the feature's own contracts schema: the widened family schema
 * does not exist yet and lands with the service layer. What can be settled
 * without it is structural — that the versioned document is the original plus
 * exactly one key per session, and that the key holds what the migration says.
 * The image object is `.strict()` on purpose: the uploader is safeguarding audit
 * and must never travel, and a loose object would let it arrive unnoticed.
 */
const v2Document = z
  .object({
    sessions: z.array(
      z
        .object({
          session_date: z.string(),
          images: z.array(
            z
              .object({
                id: z.string(),
                width: z.number(),
                height: z.number(),
              })
              .strict(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** The v2 document with `images` removed from every session. */
function withoutImages(document: z.infer<typeof v2Document>) {
  return {
    ...document,
    sessions: document.sessions.map((session) => {
      const { images: _images, ...rest } = session;
      return rest;
    }),
  };
}

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
  /** The parent's OWN seat in the same group — participant = customer. */
  let selfPlaced = "";

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
        // The parent's own seat, in the same group as their children's. Written
        // directly rather than through create_participation, exactly as every
        // other row here is: this file tests the read, and the audience gate
        // that would police the write has its own coverage in the enrollment
        // suite. What matters here is that the row shape (participant =
        // customer) is one the table has permitted since 00173.
        {
          product_id: PRODUCT_MINE,
          group_id: GROUP_MINE,
          participant_id: TEST_IDS.CUSTOMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
      ])
      .select("id, product_id, participant_id, group_id");
    expect(error).toBeNull();

    const find = (productId: string, participantId: string) => {
      const row = (parts ?? []).find(
        (p) => p.product_id === productId && p.participant_id === participantId,
      );
      if (!row) throw new Error(`fixture participation missing: ${productId}`);
      return row.id;
    };
    minePlaced = find(PRODUCT_MINE, TEST_IDS.GAMER);
    siblingPlaced = find(PRODUCT_MINE, TEST_IDS.GAMER_2);
    sitePlaced = find(PRODUCT_SITE, TEST_IDS.GAMER);
    unplaced = find(PRODUCT_UNPLACED, TEST_IDS.GAMER);
    selfPlaced = find(PRODUCT_MINE, TEST_IDS.CUSTOMER);

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

      // `participant`, not `gamer`, since 00174: the seat's occupant can be a
      // parent, and the contract is `.strict()`, so this parse is what would
      // fail if the RPC and the schema ever disagreed about the key again.
      expect(feed.participant.id).toBe(TEST_IDS.GAMER);
      expect(feed.participant.first_name).toBeTruthy();
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

    /**
     * **A parent's own seat is a page like any other**, and this is the case
     * the `participant` key exists for.
     *
     * The access predicate's first arm — "the participation's participant is
     * the caller" — is what admits it, with the parent-link fallback never
     * reached; the plan calls that true by construction post-rename, and this
     * is where "by construction" is checked rather than assumed. The child of
     * the same parent, in the same group, is *not* reachable from this
     * document, which is the same participation-not-group scoping the sibling
     * case pins from the other side.
     */
    it("hands a parent their own seat, named as the participant", async () => {
      const { data, error } = await customerAuth.rpc(
        "get_my_family_product_feed",
        { p_participation_id: selfPlaced },
      );
      expect(error).toBeNull();

      const feed = familyProductFeed.parse(data);
      expect(feed.participant.id).toBe(TEST_IDS.CUSTOMER);
      expect(feed.group.id).toBe(GROUP_MINE);
      // Their own page carries nothing about the children sharing the group.
      expect(JSON.stringify(feed)).not.toContain(TEST_IDS.GAMER);
      expect(JSON.stringify(feed)).not.toContain(TEST_IDS.GAMER_2);
    });

    it("refuses a parent's own seat to their child", async () => {
      // The other direction of the same scoping: a child in the group cannot
      // read the adult's participation just because they share it.
      const { error } = await gamerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: selfPlaced,
      });
      expect(error?.code).toBe("42501");
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

  // -------------------------------------------------------------------------
  // 5. The last editor, by id and by first name
  // -------------------------------------------------------------------------
  //
  // 00194 gave the family document `updated_by` and the first name behind it,
  // so a report card can say who wrote it. That is a deliberate widening of a
  // document whose omissions are otherwise its privacy contract: the page
  // already names every assigned gedu by id and first name, and this is the
  // same quantum of information about the same kind of person. The name
  // travels per session rather than being resolved against `gedus`, because a
  // past session's editor may have left the group since.
  //
  // Everything here runs against GROUP_SITE, which no other block in this file
  // asserts a session list for — so the history expectations above stay about
  // the three rows they were written for.

  describe("the session's last editor", () => {
    /** A second gedu on the same group — the whole point of this block. */
    let marker: SupabaseClient<Database>;
    let markerId = "";
    let markerFirstName = "";
    let writerFirstName = "";

    beforeAll(async () => {
      // Unique per run: CI's database carries the seed fixtures AND whatever a
      // previous run left behind, so a fixed address is a collision waiting to
      // happen.
      const email = `family-marker-${Date.now()}@test.local`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Ruut", last_name: "Marker" },
      });
      expect(error).toBeNull();
      markerId = data.user!.id;

      // handle_new_user lands every signup as a customer; the gedu role and the
      // extension row are an admin's doing, exactly as in the real flow.
      await admin.from("profiles").update({ role: "gedu" }).eq("id", markerId);
      await admin.from("customer_profiles").delete().eq("user_id", markerId);
      await admin
        .from("gedu_profiles")
        .insert({ user_id: markerId, certified: true });

      await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_SITE,
        gedu_id: markerId,
        product_id: PRODUCT_SITE,
      });

      marker = await createAuthenticatedClient(email, "testpassword123");

      // Read both names from the database rather than restating them here: the
      // assertion is "the feed hands back THIS person's first name", and a
      // hardcoded copy would pass just as happily against the wrong person.
      const { data: names } = await admin
        .from("profiles")
        .select("id, first_name")
        .in("id", [TEST_IDS.GEDU, markerId]);
      writerFirstName =
        names?.find((p) => p.id === TEST_IDS.GEDU)?.first_name ?? "";
      markerFirstName = names?.find((p) => p.id === markerId)?.first_name ?? "";
      expect(writerFirstName).toBeTruthy();
      expect(markerFirstName).toBe("Ruut");
    });

    afterAll(async () => {
      // The assignment FK onto profiles is ON DELETE RESTRICT, so the row has
      // to go before the account does.
      await admin
        .from("gedu_group_assignments")
        .delete()
        .eq("gedu_id", markerId);
      await admin.auth.admin.deleteUser(markerId);
      await admin.from("group_sessions").delete().eq("group_id", GROUP_SITE);
    });

    /** The in-person group's session on `date`, off the family document. */
    async function sessionOn(date: string) {
      const { data, error } = await customerAuth.rpc(
        "get_my_family_product_feed",
        { p_participation_id: sitePlaced },
      );
      expect(error).toBeNull();
      return familyProductFeed
        .parse(data)
        .sessions.find((s) => s.session_date === date);
    }

    it("names the gedu who saved the report", async () => {
      const { error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_SITE,
        p_session_date: YESTERDAY,
        p_report: "We finished the castle wall.",
        p_gedu_note: "",
      });
      expect(error).toBeNull();

      const session = await sessionOn(YESTERDAY);
      expect(session?.report).toBe("We finished the castle wall.");
      expect(session?.updated_by).toBe(TEST_IDS.GEDU);
      expect(session?.updated_by_first_name).toBe(writerFirstName);
    });

    /**
     * **The documented semantic, asserted rather than assumed: this is the last
     * TOUCHER of the session, not the author of the report.**
     *
     * One gedu writes the family-facing report; a different gedu then records a
     * single attendance mark and nothing else. The pair now names the second
     * gedu — on a write-up they did not type, in front of a parent.
     *
     * That is accepted behaviour and not a bug to fix here. `updated_by` is
     * stamped by every recorded touch (materialization, either written field,
     * and each mark or unmark), and in practice the gedu who touches one part
     * of a session touches all of it; a per-field author column was judged not
     * worth the schema for this edge. The chip claims "last edited by", which
     * is exactly what this test pins. If someone later makes this expectation
     * fail by introducing a report-author column, that is a product decision
     * being reversed, not a regression being repaired.
     */
    it("hands the attendance marker, not the report's writer, once someone else touches it", async () => {
      // Re-saved rather than leaned on from the case above, so the two orders
      // of "who wrote, who marked" are established by this test alone.
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_SITE,
        p_session_date: YESTERDAY,
        p_report: "We finished the castle wall.",
        p_gedu_note: "",
      });

      const { error } = await marker.rpc("record_attendance", {
        p_group_id: GROUP_SITE,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(error).toBeNull();

      const session = await sessionOn(YESTERDAY);
      // The report is untouched — only the register moved — and the last
      // editor moved with it anyway.
      expect(session?.report).toBe("We finished the castle wall.");
      expect(session?.updated_by).toBe(markerId);
      expect(session?.updated_by_first_name).toBe(markerFirstName);
      expect(session?.updated_by).not.toBe(TEST_IDS.GEDU);
    });

    it("leaves both halves null on a row no RPC stamped", async () => {
      // The three GROUP_MINE fixtures were seeded straight through the
      // service-role client, so nothing set `updated_by`. Null is the honest
      // answer and the card renders no chip — which is why a consumer wants
      // BOTH halves before it names anyone.
      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      const feed = familyProductFeed.parse(data);

      // Or the loop below asserts nothing at all and the case passes on an
      // empty history.
      expect(feed.sessions.length).toBeGreaterThan(0);

      for (const session of feed.sessions) {
        expect(session.updated_by).toBeNull();
        expect(session.updated_by_first_name).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. The versioned document — get_my_family_product_feed_v2
  // -------------------------------------------------------------------------
  //
  // 00222 gave every session a photo array. The family contracts schema is
  // `.strict()` at every level, so widening this RPC in place would have made
  // the still-deployed app fail to parse its own read for the minute between the
  // migration deploying and the release going live. The compatibility step is a
  // second function under a versioned name, and these are the two halves of what
  // that buys:
  //
  //   * the NEW document is the old one plus exactly one key per session, and
  //   * the OLD one is untouched, which is what the old app keeps parsing.
  //
  // The scope claim is not inherited by assumption either. `get_my_family_
  // product_feed_v2` carries its own SELF_SCOPING entry in the authorization
  // spine, and that entry points here — so every refusal the original is held to
  // is asserted against the versioned name as well, rather than being taken on
  // trust because the bodies look alike.

  describe("get_my_family_product_feed_v2", () => {
    /** The two photos seeded on YESTERDAY's session, oldest first. */
    let firstImage = "";
    let secondImage = "";

    beforeAll(async () => {
      const { data: session } = await admin
        .from("group_sessions")
        .select("id")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();
      expect(session?.id).toBeTruthy();

      // created_at is stamped explicitly rather than left to the column default,
      // because the ordering assertion below has to be about (created_at, id)
      // rather than about whatever order two rows of one INSERT happened to get.
      // Mixed ratios on purpose: a 16:9 screenshot and a portrait photo are what
      // the gallery's arithmetic is sized from.
      const { data: rows, error } = await admin
        .from("group_session_images")
        .insert([
          {
            session_id: session!.id,
            width: 1920,
            height: 1080,
            created_at: `${YESTERDAY}T19:00:00.000Z`,
            created_by: TEST_IDS.GEDU,
          },
          {
            session_id: session!.id,
            width: 1080,
            height: 1440,
            created_at: `${YESTERDAY}T19:05:00.000Z`,
            created_by: TEST_IDS.GEDU,
          },
        ])
        .select("id, created_at");
      expect(error).toBeNull();

      const ordered = [...(rows ?? [])].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      firstImage = ordered[0]?.id ?? "";
      secondImage = ordered[1]?.id ?? "";
      expect(firstImage).toBeTruthy();
      expect(secondImage).toBeTruthy();
    });

    afterAll(async () => {
      await admin
        .from("group_session_images")
        .delete()
        .in("id", [firstImage, secondImage]);
    });

    it("carries the session's photos, oldest first, and nothing about who uploaded them", async () => {
      const { data, error } = await customerAuth.rpc(
        "get_my_family_product_feed_v2",
        { p_participation_id: minePlaced },
      );
      expect(error).toBeNull();

      const feed = v2Document.parse(data);
      const session = feed.sessions.find((s) => s.session_date === YESTERDAY);

      // The order is the display order on every surface, and it is what the
      // clock_timestamp() stamp plus the id tiebreak exist to make stable.
      expect(session?.images.map((i) => i.id)).toEqual([
        firstImage,
        secondImage,
      ]);
      // Uncropped mixed ratios are the whole rendering requirement, so the
      // dimensions have to survive the round trip as numbers.
      expect(session?.images[0]).toEqual({
        id: firstImage,
        width: 1920,
        height: 1080,
      });
      expect(session?.images[1]?.height).toBe(1440);

      // `created_by` is safeguarding audit: it gates nothing, nothing renders
      // it, and a family surface is the last place for it. The `.strict()` image
      // object above would already have failed the parse; this asserts the key
      // name is absent from the whole document, wherever it might have leaked.
      // (The uploader's *id* is not a usable probe here — the gedus array names
      // the same person by design, a first name's worth of "who you are with".)
      expect(JSON.stringify(data)).not.toContain("created_by");
    });

    it("hands back an empty array for a session with no photos", async () => {
      const { data } = await customerAuth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: minePlaced,
      });
      const feed = v2Document.parse(data);

      // An empty array rather than a missing key or a null, so the renderer has
      // one shape to handle and the strict schema one thing to describe.
      expect(feed.sessions.find((s) => s.session_date === LONG_AGO)?.images).toEqual(
        [],
      );
    });

    it("is the original document plus exactly one key per session", async () => {
      const original = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });
      const versioned = await customerAuth.rpc(
        "get_my_family_product_feed_v2",
        { p_participation_id: minePlaced },
      );
      expect(versioned.error).toBeNull();

      // Strip the one added key and the rest must parse through the ORIGINAL
      // strict schema and equal the original document. Strict is what makes this
      // sharp: a field quietly renamed, dropped or added while transcribing the
      // body fails the parse rather than passing as "close enough".
      const stripped = withoutImages(v2Document.parse(versioned.data));
      expect(familyProductFeed.parse(stripped)).toEqual(
        familyProductFeed.parse(original.data),
      );
    });

    it("leaves the old RPC's document with no photos at all", async () => {
      // The deploy-window guarantee, asserted from the side that matters: the
      // old app parses the old document with a strict schema, so an `images` key
      // appearing there is not a widening, it is an outage. Non-vacuous by
      // construction — the beforeAll above attached two photos to this exact
      // session, and the case above proves the versioned RPC returns them.
      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: minePlaced,
      });

      expect(JSON.stringify(data)).not.toContain("images");
      // And it still parses through the schema the deployed app carries.
      expect(familyProductFeed.parse(data).sessions.length).toBeGreaterThan(0);
    });

    it("refuses everyone the original refuses, for the same reasons", async () => {
      // The spine's SELF_SCOPING entry for the versioned name points at this
      // file, and this is the case it points at. Each of these has its own
      // narrated block above for the original; what is being pinned here is that
      // transcribing a body did not lose one of them.
      const otherFamily = await customer2Auth.rpc(
        "get_my_family_product_feed_v2",
        { p_participation_id: minePlaced },
      );
      expect(otherFamily.error?.code).toBe("42501");
      expect(otherFamily.data).toBeNull();

      // The sibling: same parent, same group, different participation. A gate
      // written against the group rather than the participation lets this by.
      const gamer2Auth = await createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER_2.email,
        TEST_CREDENTIALS.GAMER_2.password,
      );
      const sibling = await gamer2Auth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: minePlaced,
      });
      expect(sibling.error?.code).toBe("42501");
      const siblingOwn = await gamer2Auth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: siblingPlaced,
      });
      expect(siblingOwn.error).toBeNull();

      // A child reaching for the adult's seat in the group they share.
      const upward = await gamerAuth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: selfPlaced,
      });
      expect(upward.error?.code).toBe("42501");

      // Owned but unplaced: not-found, and P0002 specifically, because
      // PostgREST maps it to the 404 the page renders.
      const noGroup = await customerAuth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: unplaced,
      });
      expect(noGroup.error?.code).toBe("P0002");

      // No oracle: a participation that does not exist answers exactly as one
      // belonging to another family does.
      const missing = await customerAuth.rpc("get_my_family_product_feed_v2", {
        p_participation_id: NO_SUCH_PARTICIPATION,
      });
      expect(missing.error?.code).toBe("42501");
      expect(missing.error?.message).toBe(otherFamily.error?.message);

      // Staff have this group's data by other routes; neither is a party to the
      // family enrollment, and this RPC answers only to parties.
      for (const client of [geduAuth, adminAuth]) {
        const staff = await client.rpc("get_my_family_product_feed_v2", {
          p_participation_id: minePlaced,
        });
        expect(staff.error?.code).toBe("42501");
      }

      // No grant to `anon` — refused at the privilege layer, before the body.
      const anonymous = await anon.rpc("get_my_family_product_feed_v2", {
        p_participation_id: minePlaced,
      });
      expect(anonymous.error).not.toBeNull();

      // 00152's regression pin, carried onto the new name: service_role holds
      // EXECUTE and its JWT carries no `sub`, so auth.uid() is NULL inside the
      // body. The uid check has to fire on its own rather than disappearing into
      // the ownership predicate, or an arbitrary participation id yields a full
      // cross-family read for any server-side caller.
      const serviceRole = await admin.rpc("get_my_family_product_feed_v2", {
        p_participation_id: minePlaced,
      });
      expect(serviceRole.error?.code).toBe("42501");
      expect(serviceRole.data).toBeNull();
    });
  });
});

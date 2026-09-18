import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import {
  INVOICE_CUSTOMER_COLUMNS,
  invoiceCustomerRow,
} from "@/services/invoice-customers/invoice-customers.contracts";

/**
 * `invoice_customers` and its two writers (migration 00268) — the Fennoa
 * customers a municipality club's invoice is addressed to.
 *
 * The table is the §3.3 grant-lockdown posture: no write grant for any Data API
 * role, so the only way in is `create_invoice_customer` /
 * `update_invoice_customer`, both admin-gated and both `SECURITY DEFINER`. The
 * authorization spine already sweeps every role against them with all-NULL
 * arguments; what it cannot show is that a refusal is about the ROLE rather
 * than about the arguments, so each wrong role is tried here once with a
 * payload a permitted caller would be given a row for.
 *
 * The rest is what a schema cannot say on its own:
 *   - the row is normalised on the way in (trimmed, country upper-cased, a
 *     blank optional field folded to NULL), so "no reference" is one state
 *   - the Fennoa customer number is unique, because two rows claiming one
 *     customer would produce two files Fennoa posts to one account
 *   - every required field is refused blank, with a readable check_violation
 *     rather than a constraint name
 *   - the read is admin-only: a customer, a gedu and a gamer each see zero
 *     rows, and `anon` holds no grant to be filtered at all
 *   - a product may carry a customer only if it is a municipality club, and a
 *     customer a club points at cannot be deleted (ON DELETE RESTRICT), which
 *     is what makes "no delete in v1" free rather than a rule nothing enforces
 *
 * **What is deliberately NOT here is the invoicing document.** That the read
 * emits the whole customer row against a club is asserted in
 * `admin-municipality-invoicing.test.ts`, which owns that RPC — and has to,
 * because one of its own cases seeds a club with no municipality, which makes
 * the function refuse every call while it stands. A second file calling the
 * same RPC in a parallel worker would fail inside that window for a reason that
 * is not a bug.
 *
 * **Every assertion is scoped to this file's own fixtures.** CI carries the
 * migrations' data, `seed.sql`, and whatever other files have seeded in
 * parallel, so a claim about "the customers" would be a claim about the whole
 * platform and false for reasons that are not bugs.
 *
 * Fixture UUIDs 805-809 (see the allocation registry in product-helpers.ts).
 */

type CreateArgs =
  Database["public"]["Functions"]["create_invoice_customer"]["Args"];
type UpdateArgs =
  Database["public"]["Functions"]["update_invoice_customer"]["Args"];

/** The municipality club the products-side cases hang off. */
const MUNI_PRODUCT = "00000000-0000-0000-0000-000000000805";
/** A consumer club — the type the CHECK must refuse the column on. */
const CONSUMER_PRODUCT = "00000000-0000-0000-0000-000000000806";
/** The customer the municipality club is invoiced to. */
const CUSTOMER_A = "00000000-0000-0000-0000-000000000807";
/** A second customer nothing points at — the RESTRICT case needs both. */
const CUSTOMER_B = "00000000-0000-0000-0000-000000000808";
/**
 * A customer id that must NEVER exist. Declared in the registry alongside the
 * rest for that reason: allocate it to a fixture and the "unknown id is
 * refused" cases quietly start pointing at a row that exists.
 */
const CUSTOMER_MISSING = "00000000-0000-0000-0000-000000000809";

/**
 * Numbers no other file uses, because `fennoa_customer_no` is UNIQUE — the one
 * column in this schema where two test files sharing a value collide on an
 * insert rather than on a primary key.
 */
const NUMBER_NEW = "F9805";
const NUMBER_A = "F9806";
const NUMBER_B = "F9807";

/** Ids created by the RPC during the run, deleted with the rest at the end. */
const minted: string[] = [];
/** Numbers this file may leave behind, whatever id they landed under. */
const USED_NUMBERS = [
  NUMBER_NEW,
  NUMBER_A,
  NUMBER_B,
  `${NUMBER_NEW}1`,
  `${NUMBER_NEW}2`,
  `${NUMBER_NEW}3`,
  `${NUMBER_NEW}4`,
];

const SEEDED_CUSTOMERS = [CUSTOMER_A, CUSTOMER_B];
const ALL_PRODUCTS = [MUNI_PRODUCT, CONSUMER_PRODUCT];

describe("invoice_customers", () => {
  /** Service-role client — bypasses RLS, used to seed, read back and clean up. */
  let admin: SupabaseClient<Database>;
  /**
   * The RPC caller. It has to be a *signed-in* admin rather than the
   * service-role client: the guard reads the caller's live role through
   * get_user_role(), and a service-role connection has no profiles row to read
   * it from.
   */
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let gedu: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  function clientFor(role: string): SupabaseClient<Database> {
    if (role === "customer") return customer;
    if (role === "gedu") return gedu;
    return gamer;
  }

  /** A full, valid create payload — each case varies exactly one field of it. */
  function payload(overrides: Partial<CreateArgs> = {}): CreateArgs {
    return {
      p_fennoa_customer_no: NUMBER_NEW,
      p_invoice_name: "Fixture City Council",
      p_street: "Virastokuja 1",
      p_postal_code: "02070",
      p_city: "Espoo",
      p_country_code: "FI",
      ...overrides,
    };
  }

  /** The seeded customer's own values, as both the seed and the restore. */
  function customerAFields() {
    return {
      fennoa_customer_no: NUMBER_A,
      invoice_name: "Fixture Library Services",
      street: "Kirjastokuja 5",
      postal_code: "33101",
      city: "Tampere",
      your_reference: "KIRJ-2026-77",
    };
  }

  function customerBFields() {
    return {
      fennoa_customer_no: NUMBER_B,
      invoice_name: "Fixture School Services",
      street: "Opintie 14",
      postal_code: "33101",
      city: "Tampere",
    };
  }

  /** Remove every row this file can create, products first (the FK points here). */
  async function cleanUp() {
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin
      .from("invoice_customers")
      .delete()
      .in("id", [...SEEDED_CUSTOMERS, ...minted]);
    await admin
      .from("invoice_customers")
      .delete()
      .in("fennoa_customer_no", USED_NUMBERS);
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

    await cleanUp();

    // Two rows seeded through the service-role client rather than through the
    // RPC: the cases that read, point at and delete them are not about how they
    // were created, and the RPC mints its own ids.
    const seeded = await admin.from("invoice_customers").insert([
      { id: CUSTOMER_A, ...customerAFields() },
      { id: CUSTOMER_B, ...customerBFields() },
    ]);
    expect(seeded.error).toBeNull();

    // The municipality club points at CUSTOMER_A; the consumer club is the
    // control the CHECK has to refuse. One product cannot be both, because the
    // constraint is keyed on product_type.
    await createTestProduct(admin, {
      id: MUNI_PRODUCT,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      startDate: "2026-01-12",
      endDate: "2026-05-29",
      seatCount: null,
      waitlistEnabled: false,
    });
    await createTestProduct(admin, { id: CONSUMER_PRODUCT });

    const linked = await admin
      .from("products")
      .update({ invoice_customer_id: CUSTOMER_A })
      .eq("id", MUNI_PRODUCT);
    expect(linked.error).toBeNull();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // -------------------------------------------------------------------------
  // create_invoice_customer
  // -------------------------------------------------------------------------

  describe("create_invoice_customer", () => {
    it("stores a customer, normalised, and returns its id", async () => {
      // Every field arrives padded and the country in lower case, because what
      // this pins is the normalisation rather than the insert: an untrimmed
      // address produces a Finvoice file nobody can post a letter to, and a
      // lower-case country code is refused by the column's own CHECK.
      const { data: id, error } = await adminAuth.rpc(
        "create_invoice_customer",
        payload({
          p_fennoa_customer_no: `  ${NUMBER_NEW}  `,
          p_invoice_name: "  Fixture City Council  ",
          p_street: "  Virastokuja 1 ",
          p_postal_code: " 02070 ",
          p_city: " Espoo ",
          p_country_code: " fi ",
          p_your_reference: "  TIL-2026-0418 ",
          // Blank rather than absent: it has to fold to NULL, or "no invoice
          // text" becomes two states the serializer would have to tell apart.
          p_invoice_text: "   ",
        }),
      );

      expect(error).toBeNull();
      expect(id).not.toBeNull();
      minted.push(id!);

      const { data: row } = await admin
        .from("invoice_customers")
        .select("*")
        .eq("id", id!)
        .single();

      expect(row).toMatchObject({
        fennoa_customer_no: NUMBER_NEW,
        invoice_name: "Fixture City Council",
        street: "Virastokuja 1",
        postal_code: "02070",
        city: "Espoo",
        country_code: "FI",
        your_reference: "TIL-2026-0418",
        invoice_text: null,
      });
    });

    it("defaults the country to FI when the argument is omitted", async () => {
      // The column's own default and the resting state of a Finnish contract
      // system, so an omitting caller writes FI rather than failing.
      const args = payload({ p_fennoa_customer_no: `${NUMBER_NEW}1` });
      delete args.p_country_code;

      const { data: id, error } = await adminAuth.rpc(
        "create_invoice_customer",
        args,
      );
      expect(error).toBeNull();
      minted.push(id!);

      const { data: row } = await admin
        .from("invoice_customers")
        .select("country_code")
        .eq("id", id!)
        .single();
      expect(row?.country_code).toBe("FI");
    });

    it("refuses a duplicate Fennoa customer number", async () => {
      // NUMBER_A belongs to the seeded row. Two rows claiming one Fennoa
      // customer would produce two files posted to one account with no way to
      // tell which was meant.
      const { error } = await adminAuth.rpc(
        "create_invoice_customer",
        payload({ p_fennoa_customer_no: NUMBER_A }),
      );
      expect(error?.code).toBe("23505");
    });

    const BLANKABLE = [
      "p_fennoa_customer_no",
      "p_invoice_name",
      "p_street",
      "p_postal_code",
      "p_city",
    ] as const;

    it.each(BLANKABLE.map((field) => [field] as const))(
      "refuses a blank %s with a readable check_violation",
      async (field) => {
        // Blank rather than null, because whitespace is what a form actually
        // sends and it is exactly what a NOT NULL column waves through.
        const args = payload({ p_fennoa_customer_no: `${NUMBER_NEW}2` });
        args[field] = "   ";

        const { error } = await adminAuth.rpc("create_invoice_customer", args);
        expect(error?.code).toBe("23514");
        // The message is the admin-facing explanation, so it has to be a
        // sentence rather than a constraint name.
        expect(error?.message ?? "").toMatch(/required|country/i);
      },
    );

    it("refuses a country code that is not two letters", async () => {
      const { error } = await adminAuth.rpc(
        "create_invoice_customer",
        payload({
          p_fennoa_customer_no: `${NUMBER_NEW}3`,
          p_country_code: "FIN",
        }),
      );
      expect(error?.code).toBe("23514");
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s calling it with a payload that would otherwise succeed",
      async (role) => {
        const number = `${NUMBER_NEW}-${role}`;
        USED_NUMBERS.push(number);

        const { error } = await clientFor(role).rpc(
          "create_invoice_customer",
          payload({ p_fennoa_customer_no: number }),
        );
        expect(error?.code).toBe("42501");

        // And nothing landed: a guard that raised after the insert would fail
        // the assertion above and leave a row behind.
        const { count } = await admin
          .from("invoice_customers")
          .select("id", { count: "exact", head: true })
          .eq("fennoa_customer_no", number);
        expect(count).toBe(0);
      },
    );
  });

  // -------------------------------------------------------------------------
  // update_invoice_customer
  // -------------------------------------------------------------------------

  describe("update_invoice_customer", () => {
    /** A full, valid update of the seeded customer, back to its own values. */
    function restoreArgs(): UpdateArgs {
      return {
        p_id: CUSTOMER_A,
        p_fennoa_customer_no: NUMBER_A,
        p_invoice_name: "Fixture Library Services",
        p_street: "Kirjastokuja 5",
        p_postal_code: "33101",
        p_city: "Tampere",
        p_country_code: "FI",
        p_your_reference: "KIRJ-2026-77",
      };
    }

    it("replaces every editable column, and clears an omitted optional one", async () => {
      // The seeded row carries a reference. This call omits both optional
      // arguments, which is the only expressible way to clear one — and the
      // reason the wire schema demands both fields on every save.
      const { data, error } = await adminAuth.rpc("update_invoice_customer", {
        p_id: CUSTOMER_A,
        p_fennoa_customer_no: NUMBER_A,
        p_invoice_name: "Fixture Library Services, renamed",
        p_street: "Kirjastokuja 9",
        p_postal_code: "33200",
        p_city: "Tampere",
        p_country_code: "se",
      });

      expect(error).toBeNull();
      expect(data).toBe(CUSTOMER_A);

      const { data: row } = await admin
        .from("invoice_customers")
        .select("*")
        .eq("id", CUSTOMER_A)
        .single();
      expect(row).toMatchObject({
        invoice_name: "Fixture Library Services, renamed",
        street: "Kirjastokuja 9",
        postal_code: "33200",
        // Upper-cased on the way in, exactly as on a create.
        country_code: "SE",
        your_reference: null,
        invoice_text: null,
      });

      // Put it back, so every case after this one reads the fixture it expects.
      const restored = await adminAuth.rpc(
        "update_invoice_customer",
        restoreArgs(),
      );
      expect(restored.error).toBeNull();
    });

    it("refuses an id no customer has", async () => {
      // Named rather than silently affecting zero rows: an edit that changed
      // nothing and said so is a save the admin would believe.
      const { error } = await adminAuth.rpc("update_invoice_customer", {
        ...restoreArgs(),
        p_id: CUSTOMER_MISSING,
      });
      expect(error?.code).toBe("P0002");
    });

    it("refuses a blank city with a check_violation", async () => {
      const { error } = await adminAuth.rpc("update_invoice_customer", {
        ...restoreArgs(),
        p_city: "  ",
      });
      expect(error?.code).toBe("23514");
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "refuses a %s calling it with a payload that would otherwise succeed",
      async (role) => {
        const { error } = await clientFor(role).rpc("update_invoice_customer", {
          ...restoreArgs(),
          p_invoice_name: `Renamed by ${role}`,
        });
        expect(error?.code).toBe("42501");

        const { data: row } = await admin
          .from("invoice_customers")
          .select("invoice_name")
          .eq("id", CUSTOMER_A)
          .single();
        expect(row?.invoice_name).toBe("Fixture Library Services");
      },
    );
  });

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  describe("who may read a customer", () => {
    it("lets a signed-in admin read one, and it parses through the contract", async () => {
      const { data, error } = await adminAuth
        .from("invoice_customers")
        .select(INVOICE_CUSTOMER_COLUMNS)
        .eq("id", CUSTOMER_A)
        .single();

      expect(error).toBeNull();
      expect(invoiceCustomerRow.parse(data)).toMatchObject({
        id: CUSTOMER_A,
        fennoa_customer_no: NUMBER_A,
        country_code: "FI",
      });
    });

    it.each([["customer"], ["gedu"], ["gamer"]])(
      "shows a %s zero rows",
      async (role) => {
        // Zero rows rather than an error: the SELECT grant lets the statement
        // run and the single admin policy filters everything out, which is what
        // an RLS read looks like when it is working.
        const { data, error } = await clientFor(role)
          .from("invoice_customers")
          .select("id")
          .in("id", SEEDED_CUSTOMERS);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      },
    );

    it("refuses an anonymous caller outright", async () => {
      // A different mechanism from the three above, which is why it is its own
      // case: `anon` holds no SELECT grant at all, so PostgreSQL refuses before
      // RLS is consulted. An empty list here would be a weaker claim than the
      // grant layer actually makes.
      const { data, error } = await anon
        .from("invoice_customers")
        .select("id")
        .in("id", SEEDED_CUSTOMERS);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // The club's link
  // -------------------------------------------------------------------------

  describe("products.invoice_customer_id", () => {
    it("accepts a customer on a municipality club", async () => {
      const { data: row } = await admin
        .from("products")
        .select("invoice_customer_id")
        .eq("id", MUNI_PRODUCT)
        .single();
      expect(row?.invoice_customer_id).toBe(CUSTOMER_A);
    });

    it("refuses a customer on a product that is not a municipality club", async () => {
      // chk_products_invoice_customer_only_for_muni. A consumer club has no
      // municipality to invoice, so a buyer on one is a row nothing could ever
      // produce a file from.
      const { error } = await admin
        .from("products")
        .update({ invoice_customer_id: CUSTOMER_B })
        .eq("id", CONSUMER_PRODUCT);
      expect(error?.code).toBe("23514");
    });

    it("refuses an id no customer has", async () => {
      const { error } = await admin
        .from("products")
        .update({ invoice_customer_id: CUSTOMER_MISSING })
        .eq("id", MUNI_PRODUCT);
      expect(error?.code).toBe("23503");
    });

    it("refuses to delete a customer a club points at, and allows one nothing does", async () => {
      // ON DELETE RESTRICT is what makes "no delete in v1" free rather than a
      // rule nothing enforces. The second half is what stops this passing
      // because deletes fail generally.
      const blocked = await admin
        .from("invoice_customers")
        .delete()
        .eq("id", CUSTOMER_A);
      expect(blocked.error?.code).toBe("23503");

      const { data: survivor } = await admin
        .from("invoice_customers")
        .select("id")
        .eq("id", CUSTOMER_A)
        .maybeSingle();
      expect(survivor?.id).toBe(CUSTOMER_A);

      const freed = await admin
        .from("invoice_customers")
        .delete()
        .eq("id", CUSTOMER_B);
      expect(freed.error).toBeNull();

      // Put it back: the case above and the cleanup both expect it.
      const restored = await admin
        .from("invoice_customers")
        .insert({ id: CUSTOMER_B, ...customerBFields() });
      expect(restored.error).toBeNull();
    });
  });
});

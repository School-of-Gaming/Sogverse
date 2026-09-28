import type { AppSupabaseClient } from "@/types";
import { walkPages } from "@/lib/supabase/paging";
import {
  INVOICE_CUSTOMER_COLUMNS,
  invoiceCustomerInput,
  type InvoiceCustomerInput,
  type InvoiceCustomerRow,
} from "./invoice-customers.contracts";

/**
 * The Fennoa customers municipality clubs are invoiced to.
 *
 * Every method runs on the injected client and nothing here calls `fetch()`:
 * there is no API route in this feature, because neither write needs a
 * server-side secret. The reads run under the table's admin-only SELECT policy
 * and the writes go through two admin-guarded `SECURITY DEFINER` RPCs — the
 * table carries no write grant at all, so a stray `.insert()` from anywhere
 * fails closed rather than landing.
 */
export class InvoiceCustomersService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every invoice customer, ordered by the name that appears on the invoice.
   *
   * **Walked, not read in one request.** It is a few dozen rows today and that
   * is a fact about current data rather than a property of the query: the table
   * only grows, and PostgREST enforces its row cap by *truncating* rather than
   * erroring, so an unbounded read would one day start returning a prefix of
   * the answer with nothing saying so. The caller here is the picker on a
   * municipality club and the admin list of customers, both of which render the
   * whole set and would otherwise quietly stop offering the customers that fell
   * off the end.
   *
   * `invoice_name` is not a total order on its own — two departments of one city
   * can share a billing name — so `id` follows it, which is what stops a tie
   * straddling a page boundary from returning one row twice and dropping
   * another.
   */
  async listInvoiceCustomers(): Promise<InvoiceCustomerRow[]> {
    return walkPages("listInvoiceCustomers", (from, to) =>
      this.supabase
        .from("invoice_customers")
        .select(INVOICE_CUSTOMER_COLUMNS, { count: "exact" })
        .order("invoice_name")
        .order("id")
        .range(from, to),
    );
  }

  /**
   * One customer by id.
   *
   * `maybeSingle`, so an id no customer has is `null` rather than an error: the
   * caller is resolving a club's stored link, and a link pointing at nothing is
   * a state to render rather than a failure — though the foreign key behind it
   * is `ON DELETE RESTRICT`, so in practice it cannot arise.
   */
  async getInvoiceCustomer(id: string): Promise<InvoiceCustomerRow | null> {
    const { data, error } = await this.supabase
      .from("invoice_customers")
      .select(INVOICE_CUSTOMER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Create a customer. Returns the new row's id.
   *
   * The input is parsed here rather than trusted: the schema is what trims the
   * fields and folds an emptied optional one to null, so the RPC and the CHECKs
   * behind it are the guarantee rather than the first thing an admin meets.
   */
  async createInvoiceCustomer(input: InvoiceCustomerInput): Promise<string> {
    const parsed = invoiceCustomerInput.parse(input);

    const { data, error } = await this.supabase.rpc("create_invoice_customer", {
      p_fennoa_customer_no: parsed.fennoa_customer_no,
      p_invoice_name: parsed.invoice_name,
      p_street: parsed.street,
      p_postal_code: parsed.postal_code,
      p_city: parsed.city,
      p_country_code: parsed.country_code,
      // Null maps to an OMISSION, so the RPC's DEFAULT NULL writes the null —
      // the same shape a product's tag takes, and the reason the field is
      // required-nullable on the way in rather than optional.
      p_your_reference: parsed.your_reference ?? undefined,
      p_invoice_text: parsed.invoice_text ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("create_invoice_customer returned no id");
    return data;
  }

  /**
   * Edit a customer. Returns its id.
   *
   * The RPC assigns every editable column on every call, which is why the whole
   * input travels on every save: an omitted optional field clears the stored
   * one, and that is the only expressible way to clear it.
   */
  async updateInvoiceCustomer(
    id: string,
    input: InvoiceCustomerInput,
  ): Promise<string> {
    const parsed = invoiceCustomerInput.parse(input);

    const { data, error } = await this.supabase.rpc("update_invoice_customer", {
      p_id: id,
      p_fennoa_customer_no: parsed.fennoa_customer_no,
      p_invoice_name: parsed.invoice_name,
      p_street: parsed.street,
      p_postal_code: parsed.postal_code,
      p_city: parsed.city,
      p_country_code: parsed.country_code,
      p_your_reference: parsed.your_reference ?? undefined,
      p_invoice_text: parsed.invoice_text ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error("update_invoice_customer returned no id");
    return data;
  }
}

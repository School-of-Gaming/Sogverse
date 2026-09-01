import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { callServiceRoleRpcRaw } from "./helpers";

/**
 * The chat tables' realtime wiring (00228), asserted because nothing else can.
 *
 * **This is the cheapest correctness-by-mechanism win in the chat plan, and it
 * exists because the failure it catches is silent and total.** Realtime
 * delivery depends on two facts that live in the PostgreSQL catalogs and appear
 * in no other artifact:
 *
 * 1. **Publication membership.** `pg_dump` does not emit `ALTER PUBLICATION`
 *    for the platform's own `supabase_realtime`, so `supabase/schema.sql` — the
 *    file every other schema-side guarantee is read from — says nothing about
 *    it. A table left out of the publication does not error, does not warn and
 *    does not fail any existing test: every client still renders its own
 *    optimistic echo, and nothing anybody else sends ever arrives. The bug
 *    reads as "chat is broken for everyone but me", which is exactly the shape
 *    nobody reproduces locally.
 * 2. **Replica identity.** A DELETE replicates its OLD row and nothing else, so
 *    a subscription filtered on a column can only receive a DELETE whose old
 *    row carries that column. `chat_reactions` needs `REPLICA IDENTITY FULL`
 *    because un-reacting IS a delete and the subscription filters on
 *    `channel_id`. `chat_messages` and `chat_channel_locks` deliberately do not:
 *    neither is ever deleted — a removal is a soft delete and an unlock is an
 *    UPDATE to NULL — so FULL there would widen every WAL record for a delete
 *    that cannot happen.
 *
 * The catalog reader behind this is `_list_replicated_tables` (00230),
 * `service_role`-only like every other `_list_*` helper.
 */

const replicatedTableRows = z.array(
  z.object({
    table_name: z.string(),
    // The enum rather than a string, for the reason `_list_views`'s `kind` is
    // one: the column is a CASE with no ELSE, so an unrecognised replica-identity
    // code arrives NULL and fails the parse rather than being read as "default".
    replica_identity: z.enum(["default", "nothing", "full", "index"]),
  }),
);

/** The three tables a chat subscriber listens to, as one channel's three handlers. */
const REPLICATED_CHAT_TABLES = [
  "chat_messages",
  "chat_reactions",
  "chat_channel_locks",
] as const;

describe("chat realtime publication + replica identity", () => {
  let replicated: Map<string, string>;

  beforeAll(async () => {
    // `callServiceRoleRpcRaw` rather than the typed `admin.rpc(...)` the other
    // catalog checks use: the generated types are regenerated after a push, and
    // this helper's own migration lands in the same change as this file. The
    // typed path would buy nothing here anyway — every `_list_*` result is
    // parsed through a zod schema regardless, so the generated signature only
    // ever supplied the function name.
    const rows = replicatedTableRows.parse(
      await callServiceRoleRpcRaw("_list_replicated_tables", {}),
    );
    replicated = new Map(rows.map((row) => [row.table_name, row.replica_identity]));
  });

  it.each(REPLICATED_CHAT_TABLES)(
    "%s is a member of the supabase_realtime publication",
    (table) => {
      expect(
        replicated.has(table),
        `${table} is not published — every subscriber would see its own echo ` +
          "and nothing else, with no error anywhere",
      ).toBe(true);
    },
  );

  it("chat_reactions carries REPLICA IDENTITY FULL", () => {
    // Un-reacting is a DELETE, and the chat subscription filters on
    // `channel_id`. Without FULL the OLD row carries the primary key alone, the
    // filter cannot match, and a taken-back reaction stays on every screen but
    // the sender's until a refetch.
    expect(replicated.get("chat_reactions")).toBe("full");
  });

  it("chat_messages and chat_channel_locks keep the default replica identity", () => {
    // Not an omission: neither table is ever deleted from. A removal is
    // hidden_at/hidden_by (an UPDATE) and an unlock is locked_at → NULL (also an
    // UPDATE), which is precisely why unlock was specified as an update rather
    // than a delete. Pinning "default" is what makes that a decision rather than
    // something a later change can widen without noticing.
    expect(replicated.get("chat_messages")).toBe("default");
    expect(replicated.get("chat_channel_locks")).toBe("default");
  });

  it("chat_channels is deliberately NOT published", () => {
    // A channel is materialized once, on mount, by the very container that is
    // about to subscribe — so there is no change to one that anybody needs to
    // hear about. Publishing it would fan an INSERT out to every subscriber in
    // the project for no reader at all.
    expect(replicated.has("chat_channels")).toBe(false);
  });
});

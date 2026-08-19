import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPasswords } from "@/lib/microsoft-graph";

/**
 * The reset core, driven against a stubbed Graph.
 *
 * Three things are decided in this module and nowhere else, and each of them is
 * the kind that only shows up against a real sequence of calls: **which UPNs an
 * entry is allowed to name** (the security boundary — the credentials here can
 * reset any account in the tenant), **how many PATCHes a batch spends** (one
 * account named twice must be reset once, or the first password on screen is
 * dead the moment the second row renders), and **which accounts are handed a
 * password they must immediately change**.
 *
 * The `fetch` stub answers by URL: the token endpoint once, then one PATCH per
 * account it has been told exists. Anything else 404s, which is exactly what
 * Graph does for a name that is not there.
 */

/** UPNs the stubbed tenant contains. Everything else answers 404. */
let existing: Set<string>;
let patched: string[];

function upnFromUrl(url: string): string {
  return decodeURIComponent(url.split("/users/")[1] ?? "");
}

beforeEach(() => {
  existing = new Set<string>();
  patched = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);

    if (url.includes("login.microsoftonline.com")) {
      return Response.json({ access_token: "t" });
    }

    const upn = upnFromUrl(url);
    if (init?.method === "PATCH" && existing.has(upn)) {
      patched.push(upn);
      return new Response(null, { status: 204 });
    }
    return new Response("not found", { status: 404 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a bare username", () => {
  it("is looked for on gamer.sog.gg first, then gedu.sog.gg", async () => {
    existing.add("alice@gedu.sog.gg");

    const [outcome] = await resetPasswords(["Alice"]);

    expect(outcome).toMatchObject({ ok: true, upn: "alice@gedu.sog.gg" });
    // The gamer probe happened and 404'd; only the gedu one was written.
    expect(patched).toEqual(["alice@gedu.sog.gg"]);
  });

  it("comes back not-found naming both domains when neither has it", async () => {
    expect(await resetPasswords(["ghost"])).toEqual([
      {
        ok: false,
        code: "not_found",
        username: "ghost",
        domains: ["gamer.sog.gg", "gedu.sog.gg"],
      },
    ]);
  });
});

describe("an address on an allowed domain", () => {
  it("pins that domain instead of probing, and is matched case-insensitively", async () => {
    existing.add("alice@gedu.sog.gg");

    const [outcome] = await resetPasswords(["Alice@GEDU.SOG.GG"]);

    expect(outcome).toMatchObject({ ok: true, upn: "alice@gedu.sog.gg" });
    expect(patched).toEqual(["alice@gedu.sog.gg"]);
  });

  it("answers not-found for the one domain it named, not for both", async () => {
    expect(await resetPasswords(["ghost@gamer.sog.gg"])).toEqual([
      {
        ok: false,
        code: "not_found",
        username: "ghost@gamer.sog.gg",
        domains: ["gamer.sog.gg"],
      },
    ]);
  });
});

describe("the domain boundary", () => {
  it("refuses any other domain without spending a Graph call", async () => {
    existing.add("principal@sog.gg");

    expect(await resetPasswords(["principal@sog.gg"])).toEqual([
      {
        ok: false,
        code: "unsupported_domain",
        domains: ["gamer.sog.gg", "gedu.sog.gg"],
      },
    ]);
    // The account exists in the stubbed tenant and was still never touched —
    // which is the whole point: certification says who may use the tool, this
    // says what the tool may reach.
    expect(patched).toEqual([]);
  });

  it("refuses an entry with no name in front of the domain", async () => {
    const [outcome] = await resetPasswords(["@gamer.sog.gg"]);
    expect(outcome).toMatchObject({ code: "unsupported_domain" });
  });

  it("refuses an empty entry as invalid rather than as a domain problem", async () => {
    expect(await resetPasswords(["   "])).toEqual([
      { ok: false, code: "invalid_username" },
    ]);
  });
});

describe("first sign-in", () => {
  it("forces a change on gedu.sog.gg and never on gamer.sog.gg", async () => {
    existing.add("alice@gamer.sog.gg");
    existing.add("sanna@gedu.sog.gg");

    const outcomes = await resetPasswords(["alice", "sanna@gedu.sog.gg"]);

    expect(outcomes).toMatchObject([
      { ok: true, forceChange: false },
      { ok: true, forceChange: true },
    ]);
  });
});

describe("one account named twice in one batch", () => {
  it("resets it once and answers both rows with the same live password", async () => {
    existing.add("alice@gamer.sog.gg");

    const outcomes = await resetPasswords(["alice", "ALICE@gamer.sog.gg"]);

    // The second reset is what would have made the first row's password dead
    // while it was still on screen, with nothing saying so.
    expect(patched).toEqual(["alice@gamer.sog.gg"]);
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]).toMatchObject({ ok: true, upn: "alice@gamer.sog.gg" });
  });

  it("still resets two different accounts separately", async () => {
    existing.add("alice@gamer.sog.gg");
    existing.add("bob@gamer.sog.gg");

    const outcomes = await resetPasswords(["alice", "bob"]);

    expect(patched).toEqual(["alice@gamer.sog.gg", "bob@gamer.sog.gg"]);
    expect(outcomes).toMatchObject([
      { ok: true, upn: "alice@gamer.sog.gg" },
      { ok: true, upn: "bob@gamer.sog.gg" },
    ]);
  });
});

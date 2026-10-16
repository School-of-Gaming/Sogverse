import { describe, expect, it } from "vitest";

import {
  credentialsFor,
  pickGamer,
  resolveBase,
  resolveStack,
  stackFromSupabaseOrigin,
  supabaseOriginFromCsp,
  viewerOf,
} from "../../scripts/preview-export/lib.mjs";

const csp = (supabase: string) =>
  `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ${supabase} ${supabase.replace(
    /^http/,
    "ws",
  )} https://*.supabase.co wss://*.supabase.co https://*.daily.co https://www.google.com; img-src 'self'`;

describe("supabaseOriginFromCsp", () => {
  it("reads a local stack's origin, the first concrete URL in connect-src", () => {
    expect(supabaseOriginFromCsp(csp("http://127.0.0.1:20121"))).toBe("http://127.0.0.1:20121");
  });

  it("reads a hosted project's origin", () => {
    expect(supabaseOriginFromCsp(csp("https://abcdefgh.supabase.co"))).toBe("https://abcdefgh.supabase.co");
  });

  it("says nothing when the server fell back to the wildcard, or sent no policy", () => {
    expect(supabaseOriginFromCsp("connect-src 'self' https://*.supabase.co wss://*.supabase.co")).toBeNull();
    expect(supabaseOriginFromCsp(null)).toBeNull();
    expect(supabaseOriginFromCsp("default-src 'self'")).toBeNull();
  });
});

describe("stackFromSupabaseOrigin", () => {
  it("calls a loopback origin a local stack and a supabase.co one staging", () => {
    expect(stackFromSupabaseOrigin("http://127.0.0.1:20121")).toBe("local");
    expect(stackFromSupabaseOrigin("http://localhost:54321")).toBe("local");
    expect(stackFromSupabaseOrigin("https://abcdefgh.supabase.co")).toBe("staging");
  });

  it("cannot tell from anything else", () => {
    expect(stackFromSupabaseOrigin(null)).toBeNull();
    expect(stackFromSupabaseOrigin("http://abcdefgh.supabase.co")).toBeNull();
    expect(stackFromSupabaseOrigin("https://supabase.example.com")).toBeNull();
  });
});

describe("resolveStack", () => {
  it("takes the detection, and the flag only when there is none", () => {
    expect(resolveStack("local", undefined)).toBe("local");
    expect(resolveStack("local", "local")).toBe("local");
    expect(resolveStack(null, "staging")).toBe("staging");
  });

  it("refuses a flag that disagrees with the server", () => {
    expect(() => resolveStack("local", "staging")).toThrow(/disagrees/);
    expect(() => resolveStack("staging", "local")).toThrow(/disagrees/);
  });

  it("refuses to guess, and refuses an unknown flag", () => {
    expect(() => resolveStack(null, undefined)).toThrow(/--stack/);
    expect(() => resolveStack(null, "prod")).toThrow(/must be one of/);
  });
});

describe("resolveBase", () => {
  it("lets a signed-in run reach loopback only", () => {
    expect(resolveBase("http://localhost:3007/en", false)).toBe("http://localhost:3007");
    expect(resolveBase("http://127.0.0.1:3000", false)).toBe("http://127.0.0.1:3000");
    expect(resolveBase("http://[::1]:3000", false)).toBe("http://[::1]:3000");
    expect(() => resolveBase("https://sogverse.sog.gg", false)).toThrow(/not a local dev server/);
    expect(() => resolveBase("http://localhost.evil.com:3000", false)).toThrow(/not a local dev server/);
  });

  it("lets a signed-out run reach any http origin, and nothing else", () => {
    expect(resolveBase("https://sogverse.sog.gg", true)).toBe("https://sogverse.sog.gg");
    expect(() => resolveBase("ftp://localhost", true)).toThrow(/http or https/);
    expect(() => resolveBase("not a url", true)).toThrow(/not a URL/);
  });
});

describe("viewerOf", () => {
  const preset = { groups: [] };

  it("defaults to the admin, and takes the preset's default before that", () => {
    expect(viewerOf({ slug: "a" }, preset)).toEqual({ role: "admin", gamer: null, key: "admin" });
    expect(viewerOf({ slug: "a" }, { ...preset, viewer: "gedu" })?.role).toBe("gedu");
    expect(viewerOf({ slug: "a", viewer: "parent" }, { ...preset, viewer: "gedu" })?.role).toBe("parent");
  });

  it("names a gamer by first name, or leaves it to the first", () => {
    expect(viewerOf({ slug: "a", viewer: "gamer" }, preset)).toEqual({ role: "gamer", gamer: null, key: "gamer" });
    expect(viewerOf({ slug: "a", viewer: "gamer:Nea" }, preset)).toEqual({
      role: "gamer",
      gamer: "Nea",
      key: "gamer:Nea",
    });
  });

  it("refuses an unknown viewer, and a name on anyone but a gamer", () => {
    expect(() => viewerOf({ slug: "a", viewer: "teacher" }, preset)).toThrow(/expected one of/);
    expect(() => viewerOf({ slug: "a", viewer: "parent:Nea" }, preset)).toThrow(/expected one of/);
  });

  it("has no viewer in a signed-out preset, and refuses one named there", () => {
    expect(viewerOf({ slug: "a" }, { ...preset, signedOut: true })).toBeNull();
    expect(() => viewerOf({ slug: "a", viewer: "parent" }, { ...preset, signedOut: true })).toThrow(/signed-out/);
  });
});

describe("credentialsFor", () => {
  const staging = {
    STAGING_ADMIN_EMAIL: "admin@staging",
    STAGING_ADMIN_PASSWORD: "staging-admin-secret",
    STAGING_PARENT_EMAIL: "parent@staging",
    STAGING_PARENT_PASSWORD: "staging-parent-secret",
    STAGING_PARENT_PIN: "9999",
  };

  it("hands out nothing for a host that is not loopback, whatever the stack", () => {
    for (const stack of ["local", "staging"]) {
      expect(() => credentialsFor("admin", stack, "sogverse.sog.gg", staging)).toThrow(/Refusing/);
    }
  });

  it("gives a local stack the rich seed's accounts and never a staging value", () => {
    for (const role of ["admin", "parent", "gamer", "gedu"]) {
      const c = credentialsFor(role, "local", "localhost", staging);
      expect(c.email).toMatch(/@example\.com$/);
      expect(c.password).toBe("password");
      expect(Object.values(staging)).not.toContain(c.email);
      expect(Object.values(staging)).not.toContain(c.password);
    }
    expect(credentialsFor("gamer", "local", "localhost", {}).email).toBe("parent@example.com");
    expect(credentialsFor("parent", "local", "localhost", {}).pin).toBe("1111");
    expect(credentialsFor("gedu", "local", "localhost", {}).pin).toBeNull();
  });

  it("gives staging its own accounts and never the seed's password", () => {
    const admin = credentialsFor("admin", "staging", "127.0.0.1", staging);
    expect(admin).toMatchObject({ email: "admin@staging", password: "staging-admin-secret", pin: null });
    const gamer = credentialsFor("gamer", "staging", "127.0.0.1", staging);
    expect(gamer).toMatchObject({ email: "parent@staging", password: "staging-parent-secret", pin: "9999" });
    expect(admin.password).not.toBe("password");
  });

  it("names what staging is missing, and has no gedu", () => {
    expect(() => credentialsFor("admin", "staging", "localhost", {})).toThrow(
      /STAGING_ADMIN_EMAIL, STAGING_ADMIN_PASSWORD/,
    );
    expect(() => credentialsFor("parent", "staging", "localhost", { ...staging, STAGING_PARENT_PIN: "" })).toThrow(
      /STAGING_PARENT_PIN/,
    );
    expect(() => credentialsFor("gedu", "staging", "localhost", staging)).toThrow(/no staging account/);
  });

  it("never prints a value in its source line", () => {
    const c = credentialsFor("parent", "staging", "localhost", staging);
    expect(c.source).not.toContain("staging-parent-secret");
    expect(c.source).toContain("STAGING_PARENT_PASSWORD");
  });
});

describe("pickGamer", () => {
  const family = [
    { id: "p", role: "customer", first_name: "Parent" },
    { id: "m", role: "gamer", first_name: "Milo", sign_in: "parent" },
    { id: "n", role: "gamer", first_name: "Nea", sign_in: "username" },
  ];

  it("takes the named gamer, case-blind, or the first", () => {
    expect(pickGamer(family, "nea").id).toBe("n");
    expect(pickGamer(family, null).id).toBe("m");
  });

  it("names the gamers there are when the one asked for is not", () => {
    expect(() => pickGamer(family, "Otso")).toThrow(/Milo, Nea/);
    expect(() => pickGamer([family[0]], null)).toThrow(/no gamers/);
  });
});

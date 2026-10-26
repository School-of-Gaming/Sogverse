import { describe, expect, it } from "vitest";

import {
  assertPinVerified,
  assertProbeLanding,
  credentialsFor,
  gateOf,
  pickGamer,
  resolveBase,
  resolveStack,
  shotLandingError,
  signInOrder,
  stackFromSupabaseOrigin,
  supabaseOriginFromCsp,
  viewerOf,
  viewportsOf,
} from "../../scripts/preview-export/lib.mjs";

const csp = (supabase: string) =>
  `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ${supabase} ${supabase.replace(
    /^http/,
    "ws",
  )} https://*.supabase.co wss://*.supabase.co https://*.daily.co https://www.google.com; img-src 'self'`;

describe("supabaseOriginFromCsp", () => {
  it("reads a local stack's origin, the URL straight after 'self' in connect-src", () => {
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

  it("never mistakes a third-party host for the origin when the server fell back to the wildcard", () => {
    // The proxy's connect-src when NEXT_PUBLIC_SUPABASE_URL is unset: the
    // wildcard fills the Supabase slot, and concrete hosts follow it.
    const fallback =
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://*.ingest.sentry.io https://www.facebook.com https://www.googletagmanager.com https://www.google.com";
    expect(supabaseOriginFromCsp(fallback)).toBeNull();
    expect(resolveStack(stackFromSupabaseOrigin(supabaseOriginFromCsp(fallback), "stagingref"), "local")).toBe(
      "local",
    );
  });
});

describe("stackFromSupabaseOrigin", () => {
  const ref = "stagingref";

  it("calls a loopback origin a local stack, and the staging project staging", () => {
    expect(stackFromSupabaseOrigin("http://127.0.0.1:20121", ref)).toBe("local");
    expect(stackFromSupabaseOrigin("http://localhost:54321", undefined)).toBe("local");
    expect(stackFromSupabaseOrigin("https://stagingref.supabase.co", ref)).toBe("staging");
  });

  it("refuses any other hosted project, production included", () => {
    expect(() => stackFromSupabaseOrigin("https://prodref.supabase.co", ref)).toThrow(
      /not the staging project/,
    );
  });

  it("refuses a hosted project when there is no staging ref to check it against", () => {
    expect(() => stackFromSupabaseOrigin("https://stagingref.supabase.co", undefined)).toThrow(
      /SUPABASE_PROJECT_REF is not set/,
    );
  });

  it("refuses an origin that is neither loopback nor hosted Supabase", () => {
    expect(() => stackFromSupabaseOrigin("https://supabase.example.com", ref)).toThrow(/neither/);
    expect(() => stackFromSupabaseOrigin("http://stagingref.supabase.co", ref)).toThrow(/neither/);
  });

  it("refuses such an origin before --stack is consulted", () => {
    for (const flag of ["local", "staging"]) {
      expect(() =>
        resolveStack(stackFromSupabaseOrigin("https://supabase.example.com", ref), flag),
      ).toThrow(/neither/);
    }
  });

  it("says nothing when there is no origin, leaving it to --stack", () => {
    expect(stackFromSupabaseOrigin(null, ref)).toBeNull();
  });
});

describe("resolveStack", () => {
  it("takes the detection, and the flag only when there is none", () => {
    expect(resolveStack("local", undefined)).toBe("local");
    expect(resolveStack("local", "local")).toBe("local");
    expect(resolveStack("staging", "staging")).toBe("staging");
    expect(resolveStack(null, "local")).toBe("local");
  });

  it("refuses --stack staging when there is no origin to verify", () => {
    expect(() => resolveStack(null, "staging")).toThrow(/cannot stand in/);
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
    expect(() => resolveBase("https://sog.gg", false)).toThrow(/not a local dev server/);
    expect(() => resolveBase("http://localhost.evil.com:3000", false)).toThrow(/not a local dev server/);
  });

  it("lets a signed-out run reach any http origin, and nothing else", () => {
    expect(resolveBase("https://sog.gg", true)).toBe("https://sog.gg");
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
      expect(() => credentialsFor("admin", stack, "sog.gg", staging)).toThrow(/Refusing/);
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

describe("signInOrder", () => {
  const v = (key: string) => ({ role: key.split(":")[0], key });

  it("signs every gamer in before any parent, and keeps the rest in order", () => {
    const order = signInOrder([v("parent"), v("admin"), v("gamer"), v("gedu"), v("gamer:Nea")]);
    expect(order.map((x) => x.key)).toEqual(["gamer", "gamer:Nea", "parent", "admin", "gedu"]);
  });

  it("leaves a run with no gamer as it was", () => {
    expect(signInOrder([v("admin"), v("parent")]).map((x) => x.key)).toEqual(["admin", "parent"]);
  });
});

describe("assertPinVerified", () => {
  it("passes only a 200 that says verified", () => {
    expect(() => assertPinVerified("parent", 200, { verified: true }, "src")).not.toThrow();
  });

  it("refuses the wrong PIN the route answers with a 200", () => {
    expect(() => assertPinVerified("parent", 200, { verified: false }, "src")).toThrow(/PIN is wrong/);
    expect(() => assertPinVerified("parent", 200, null, "src")).toThrow(/PIN is wrong/);
  });

  it("refuses an HTTP failure by its status", () => {
    expect(() => assertPinVerified("parent", 401, { verified: true }, "src")).toThrow(/HTTP 401/);
  });
});

describe("gateOf", () => {
  it("knows the login page and the unlock gate in any locale", () => {
    expect(gateOf("/en/login")).toBe("/login");
    expect(gateOf("/fi/login")).toBe("/login");
    expect(gateOf("/tlh/parent/unlock")).toBe("/parent/unlock");
    expect(gateOf("/login")).toBe("/login");
  });

  it("is not fooled by a page under or beside one", () => {
    expect(gateOf("/en/parent")).toBeNull();
    expect(gateOf("/en/parent/unlock/x")).toBeNull();
    expect(gateOf("/en/gamer/login")).toBeNull();
  });
});

describe("assertProbeLanding", () => {
  it("passes the probe page itself", () => {
    expect(() => assertProbeLanding("parent", "/en/parent", "/en/parent")).not.toThrow();
  });

  it("refuses the unlock gate, though it sits under the parent's probe", () => {
    expect(() => assertProbeLanding("parent", "/en/parent", "/en/parent/unlock")).toThrow(/PIN unlock gate/);
  });

  it("refuses the login page and another role's dashboard", () => {
    expect(() => assertProbeLanding("admin", "/en/gedu", "/en/login")).toThrow(/login page/);
    expect(() => assertProbeLanding("gamer", "/en/gamer", "/en/parent")).toThrow(/sent it to \/en\/parent/);
  });
});

describe("shotLandingError", () => {
  it("fails a shot bounced to a gate, naming it", () => {
    expect(shotLandingError("/en/parent/clubs/1", "/en/parent/unlock")).toMatch(/PIN unlock gate/);
    expect(shotLandingError("/fi/gamer", "/fi/login")).toMatch(/login page/);
  });

  it("passes a shot that asked for the gate, or landed anywhere else", () => {
    expect(shotLandingError("/en/login", "/en/login")).toBeNull();
    expect(shotLandingError("/fi/shop", "/fi/kauppa")).toBeNull();
  });
});

describe("viewportsOf", () => {
  const known = ["desktop", "mobile"];

  it("is null when the entry names none, and the names when they are known", () => {
    expect(viewportsOf({ slug: "a" }, known)).toBeNull();
    expect(viewportsOf({ slug: "a", viewports: ["desktop"] }, known)).toEqual(["desktop"]);
  });

  it("refuses a misspelt or empty list by the entry's name", () => {
    expect(() => viewportsOf({ slug: "a", viewports: ["dekstop"] }, known)).toThrow(/Entry "a".*dekstop/);
    expect(() => viewportsOf({ slug: "a", viewports: [] }, known)).toThrow(/Entry "a"/);
    expect(() => viewportsOf({ slug: "a", viewports: "desktop" }, known)).toThrow(/Entry "a"/);
  });
});

import { describe, expect, it } from "vitest";
import { clientIpFrom, clientNetwork } from "@/lib/request-ip";

/**
 * **The requesting address, and the network it is counted as.** An IPv6
 * subscriber holds a whole /64 and can draw a fresh address from it at will,
 * so a per-client count keys on the /64 however the address is written; an
 * IPv4 address, bare or carried in IPv6, is counted as itself.
 */

describe("clientIpFrom", () => {
  it("takes the first entry of x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip, and to nothing", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIpFrom(new Headers())).toBeUndefined();
  });
});

describe("clientNetwork", () => {
  it("counts an IPv4 address as itself", () => {
    expect(clientNetwork("203.0.113.7")).toBe("203.0.113.7");
  });

  it.each([
    ["2001:db8:1:2::a"],
    ["2001:db8:1:2:ffff:ffff:ffff:ffff"],
    ["2001:0DB8:0001:0002:0:0:0:1"],
    ["2001:db8:1:2::1.2.3.4"],
    ["2001:db8:1:2::1%eth0"],
  ])("counts %s as its /64", (ip) => {
    expect(clientNetwork(ip)).toBe("2001:db8:1:2::/64");
  });

  it("expands `::` wherever it falls in the first four groups", () => {
    expect(clientNetwork("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientNetwork("::1")).toBe("0:0:0:0::/64");
    expect(clientNetwork("fe80::")).toBe("fe80:0:0:0::/64");
  });

  it("tells two /64s apart", () => {
    expect(clientNetwork("2001:db8:1:2::a")).not.toBe(clientNetwork("2001:db8:1:3::a"));
  });

  it.each([["::ffff:203.0.113.7"], ["::FFFF:cb00:7107"], ["0:0:0:0:0:ffff:203.0.113.7"]])(
    "counts the IPv4-mapped %s as the IPv4 address",
    (ip) => {
      expect(clientNetwork(ip)).toBe("203.0.113.7");
    },
  );

  it.each([["2001:db8::1::2"], ["2001:db8:1:2:3:4:5"], ["2001:db8::zz"], ["::ffff:1.2.3.256"]])(
    "returns %s unchanged when it does not parse",
    (ip) => {
      expect(clientNetwork(ip)).toBe(ip);
    },
  );
});

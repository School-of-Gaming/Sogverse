import { describe, expect, it } from "vitest";
import { describeRedirectDestination, isNavigableRedirect } from "@/lib/oauth-consent";

describe("describeRedirectDestination", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", "claude.ai"],
    ["https://chatgpt.com/connector_platform_oauth_redirect", "chatgpt.com"],
    ["cursor://anysphere.cursor-mcp/oauth/callback", "cursor://anysphere.cursor-mcp"],
  ])("recognises %s and shows %s", (uri, display) => {
    expect(describeRedirectDestination(uri)).toEqual({
      display,
      recognised: true,
      loopback: false,
    });
  });

  it.each([
    "http://localhost:53123/callback",
    "http://127.0.0.1:8080/callback",
    "http://[::1]:9000/callback",
  ])("recognises the loopback callback %s on any port", (uri) => {
    expect(describeRedirectDestination(uri)).toMatchObject({
      recognised: true,
      loopback: true,
    });
  });

  it.each([
    // A look-alike subdomain or suffix is a different host.
    ["https://claude.ai.evil.example/cb", "claude.ai.evil.example"],
    ["https://evilclaude.ai/cb", "evilclaude.ai"],
    // The right host on the wrong scheme is not the AI app's callback.
    ["http://claude.ai/cb", "claude.ai"],
    // Loopback is recognised only as plain http on the machine itself.
    ["https://localhost.evil.example/cb", "localhost.evil.example"],
  ])("does not recognise %s", (uri, display) => {
    expect(describeRedirectDestination(uri)).toEqual({
      display,
      recognised: false,
      loopback: false,
    });
  });

  it("shows an unparseable URI as it is, unrecognised", () => {
    expect(describeRedirectDestination("not a url")).toEqual({
      display: "not a url",
      recognised: false,
      loopback: false,
    });
  });
});

describe("isNavigableRedirect", () => {
  it("admits web and app callbacks", () => {
    expect(isNavigableRedirect("https://claude.ai/cb?code=x")).toBe(true);
    expect(isNavigableRedirect("http://127.0.0.1:5000/cb?code=x")).toBe(true);
    expect(isNavigableRedirect("cursor://anysphere.cursor-mcp/oauth/callback?code=x")).toBe(true);
  });

  it("refuses script schemes and garbage", () => {
    expect(isNavigableRedirect("javascript://x/%0aalert(1)")).toBe(false);
    expect(isNavigableRedirect("data:text/html,hi")).toBe(false);
    expect(isNavigableRedirect("not a url")).toBe(false);
  });
});

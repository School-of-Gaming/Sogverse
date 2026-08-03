import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { RobloxUsernameBadge } from "@/components/roblox/roblox-username-badge";

// The badge only reads the "roblox.account" namespace. Stub useTranslations so
// the test asserts the state→copy/colour mapping without loading message files.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

describe("RobloxUsernameBadge", () => {
  it("renders the verified state in success colour with a check", () => {
    const { getByText, getByLabelText, container } = render(
      <RobloxUsernameBadge username="EliasBuilds" userId={68306362} />,
    );

    expect(getByText("EliasBuilds")).toBeTruthy();
    expect(getByLabelText("EliasBuilds (verified)").className).toContain(
      "text-success",
    );
    // blocks + check = two svg icons when verified
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("renders the unverified state in warning colour, no check", () => {
    const { getByLabelText, container } = render(
      <RobloxUsernameBadge username="EliasBuilds" userId={null} />,
    );

    expect(getByLabelText("EliasBuilds (not yet verified)").className).toContain(
      "text-warning",
    );
    // blocks only
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders the not-provided state as muted '(Unknown)'", () => {
    const { getByText, getByLabelText } = render(
      <RobloxUsernameBadge username={null} userId={null} />,
    );

    expect(getByText("(Unknown)")).toBeTruthy();
    expect(getByLabelText("(Unknown)").className).toContain(
      "text-muted-foreground",
    );
  });

  it("uses the larger text size when size='base'", () => {
    const { getByLabelText } = render(
      <RobloxUsernameBadge username="EliasBuilds" userId={1} size="base" />,
    );

    expect(getByLabelText("EliasBuilds (verified)").className).toContain(
      "text-sm",
    );
  });
});

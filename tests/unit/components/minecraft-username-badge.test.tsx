import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MinecraftUsernameBadge } from "@/components/minecraft/minecraft-username-badge";

// The badge only reads the "minecraft" namespace. Stub useTranslations so the
// test asserts the state→copy/colour mapping without loading message files.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "verified":
        return "Verified";
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

describe("MinecraftUsernameBadge", () => {
  it("renders the verified state in success colour with a check", () => {
    const { getByText, getByLabelText, container } = render(
      <MinecraftUsernameBadge username="Steve" uuid="uuid-123" />,
    );

    expect(getByText("Steve")).toBeTruthy();
    expect(getByLabelText("Steve (verified)").className).toContain(
      "text-success",
    );
    // pickaxe + check = two svg icons when verified
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("renders the unverified state in warning colour, no check", () => {
    const { getByText, getByLabelText, container } = render(
      <MinecraftUsernameBadge username="Steve" uuid={null} />,
    );

    expect(getByText("Steve")).toBeTruthy();
    expect(getByLabelText("Steve (not yet verified)").className).toContain(
      "text-warning",
    );
    // pickaxe only
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders the not-provided state as muted '(Unknown)'", () => {
    const { getByText, getByLabelText } = render(
      <MinecraftUsernameBadge username={null} uuid={null} />,
    );

    expect(getByText("(Unknown)")).toBeTruthy();
    expect(getByLabelText("(Unknown)").className).toContain(
      "text-muted-foreground",
    );
  });

  it("uses the larger text size when size='base'", () => {
    const { getByLabelText } = render(
      <MinecraftUsernameBadge username="Steve" uuid="uuid-123" size="base" />,
    );

    expect(getByLabelText("Steve (verified)").className).toContain("text-sm");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { RobloxUsernameField } from "@/components/roblox/roblox-username-field";
import type { RobloxProfileResponse } from "@/services/roblox";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    switch (key) {
      case "label":
        return "Roblox Username";
      case "verify":
        return "Verify";
      case "verifying":
        return "Verifying...";
      case "verifiedUser":
        return `${params?.username} (verified)`;
      case "unverified":
        return `${params?.username} (not yet verified)`;
      case "notFound":
        return "Roblox account not found.";
      case "none":
        return "(Unknown)";
      default:
        return key;
    }
  },
}));

/** The in-flight lookup, resolvable by the test at the exact moment it chooses. */
let settle: {
  resolve: (profile: RobloxProfileResponse) => void;
  reject: (err: Error) => void;
};
const mutateAsync = vi.fn(
  () =>
    new Promise<RobloxProfileResponse>((resolve, reject) => {
      settle = { resolve, reject };
    }),
);

vi.mock("@/services/roblox", () => ({
  useVerifyRoblox: () => ({ mutateAsync }),
}));

/**
 * The field is controlled, so a test that types has to hold the value the way a
 * real parent does — otherwise the input never changes and the race under test
 * cannot happen.
 */
function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <RobloxUsernameField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function setup() {
  const onChange = vi.fn();
  const utils = render(<Harness onChange={onChange} />);
  const input = utils.container.querySelector("input");
  const button = utils.container.querySelector("button");
  if (!input || !button) throw new Error("the field lost a control");
  const type = (value: string) => fireEvent.change(input, { target: { value } });
  return { ...utils, input, button, onChange, type };
}

const profile = (username: string): RobloxProfileResponse => ({
  username,
  userId: 2207291,
  displayName: username,
  avatarUrl: null,
});

beforeEach(() => {
  mutateAsync.mockClear();
});

describe("RobloxUsernameField", () => {
  it("adopts the canonical casing when the field has not moved on", async () => {
    const { input, button, onChange, type } = setup();

    type("linkmon99");
    fireEvent.click(button);
    await act(async () => settle.resolve(profile("Linkmon99")));

    expect(onChange).toHaveBeenCalledWith("Linkmon99");
    expect(input.value).toBe("Linkmon99");
  });

  /**
   * The regression this file exists for.
   *
   * The input stays editable for the whole flight, so a result can land against
   * a box that has since moved on. The guard used to compare the response with
   * the value captured at click time, which differs from the canonical casing on
   * the ordinary path — anyone typing lowercase — so it fired `onChange` and
   * wrote a stale answer over what was being typed.
   */
  it("discards a result whose name the field no longer holds", async () => {
    const { input, button, onChange, type } = setup();

    type("linkmon99");
    fireEvent.click(button);
    // Still in flight, and the user carries on typing.
    type("linkmon99xyz");
    onChange.mockClear();

    await act(async () => settle.resolve(profile("Linkmon99")));

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("linkmon99xyz");
  });

  it("does not pin a stale failure on a name the user has since retyped", async () => {
    const { input, button, queryByText, type } = setup();

    type("zzq_notreal99812");
    fireEvent.click(button);
    type("builderman");

    await act(async () => settle.reject(new Error("Roblox account not found.")));

    expect(queryByText("Roblox account not found.")).toBeNull();
    expect(input.value).toBe("builderman");
  });

  it("releases the button once a discarded result lands, so a retry is possible", async () => {
    const { button, type } = setup();

    type("linkmon99");
    fireEvent.click(button);
    expect(button.disabled).toBe(true);

    type("builderman");
    await act(async () => settle.resolve(profile("Linkmon99")));

    // The request finished, so the flight is over even though its answer was
    // thrown away — leaving it disabled would strand the field.
    expect(button.disabled).toBe(false);
  });

  it("holds the button disabled for the whole flight", async () => {
    const { button, type } = setup();

    type("linkmon99");
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(button.disabled).toBe(true);

    await act(async () => settle.resolve(profile("Linkmon99")));
    expect(button.disabled).toBe(false);
  });
});

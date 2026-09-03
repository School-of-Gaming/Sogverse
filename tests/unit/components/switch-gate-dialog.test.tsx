import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SwitchGateBody } from "@/components/family/SwitchGateDialog";
import {
  SwitchAccountError,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PASSWORD_INVALID,
  type FamilyMember,
  type SwitchAccountCredentials,
  type SwitchAccountErrorCode,
} from "@/services/family";

/**
 * The gate a child pays to leave their own account.
 *
 * What is worth pinning here is not the markup but the three endings, because
 * each is a promise the route already makes and the UI has to match: a wrong
 * value never navigates and never signs anybody out, a family that holds no PIN
 * is told so instead of being asked to type more carefully, and a switch that
 * lands keeps every control disabled right through the navigation it causes.
 */

// A real, generated UUID — the same discipline every fixture person gets, so
// this one can be handed to an avatar-bearing surface unchanged.
const TARGET: FamilyMember = {
  id: "3b41f7dc-0b4a-4a2b-9a2e-9b0f1b7c6d21",
  role: "customer",
  first_name: "Riikka",
  sign_in: null,
};

const GATE = messages.family.switchGate;

/**
 * Drives the controlled `committing` pair the way both hosts do, and reports
 * what it ended up holding — the flag is the loading contract, and the whole
 * point of the success case is that it is never handed back.
 */
function Harness({
  mode,
  onCommit,
  committingSpy,
}: {
  mode: "pin" | "password";
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
  committingSpy?: (value: boolean) => void;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <Stateful mode={mode} onCommit={onCommit} committingSpy={committingSpy} />
    </NextIntlClientProvider>
  );
}

function Stateful({
  mode,
  onCommit,
  committingSpy,
}: {
  mode: "pin" | "password";
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
  committingSpy?: (value: boolean) => void;
}) {
  const [committing, setCommitting] = useState(false);
  return (
    <SwitchGateBody
      target={TARGET}
      mode={mode}
      committing={committing}
      onCommittingChange={(next) => {
        committingSpy?.(next);
        setCommitting(next);
      }}
      onCommit={onCommit}
      onClose={onClose}
    />
  );
}

const onClose = vi.fn();

/**
 * Taps four digits on the pad, which is what submits it — one click at a time,
 * outside any `act` scope of our own. Inside one, React holds every update
 * until the scope exits, so all four taps would read an empty pad and the
 * fourth would never complete it. The trailing flush is for the commit promise.
 */
async function enterPin(digits = "1234") {
  for (const digit of digits) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  await act(async () => {});
}

function refusal(code: SwitchAccountErrorCode) {
  return new SwitchAccountError("refused", 403, code);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  onClose.mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("SwitchGateBody — the PIN gate", () => {
  it("keeps the reader in the dialog when the PIN is wrong, and clears for a retry", async () => {
    const onCommit = vi.fn().mockRejectedValue(refusal(SWITCH_PIN_INVALID));
    render(<Harness mode="pin" onCommit={onCommit} />);

    await enterPin();

    expect(onCommit).toHaveBeenCalledWith({ pin: "1234" });
    // Still the prompt: a refused gate leaves the child's session untouched, so
    // the UI must not move them either.
    expect(screen.getByText(GATE.pinTitle)).toBeTruthy();
    // No error text — a wrong PIN is answered in the pad's own language (the
    // flash, the shake, the clear), which is the convention every PIN screen
    // in the app keeps.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("turns into a message when no parent in the family has a PIN", async () => {
    const onCommit = vi.fn().mockRejectedValue(refusal(SWITCH_PIN_NOT_SET));
    render(<Harness mode="pin" onCommit={onCommit} />);

    await enterPin();

    // Typing more carefully cannot fix this, so the prompt is gone entirely and
    // the family is pointed at the thing that would.
    expect(screen.getByText(GATE.pinNotSetTitle)).toBeTruthy();
    expect(screen.getByText(GATE.pinNotSetDescription)).toBeTruthy();
    expect(screen.queryByText(GATE.pinTitle)).toBeNull();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    // One way out, and it is not a "forgot PIN" link: that route is
    // customer-gated, so a child could never complete it.
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([messages.common.close]);

    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("holds the pad disabled through a switch that lands", async () => {
    // The promise never settles, standing in for the document unloading: on the
    // success path nothing is ever handed back, because there is no frame left
    // to hand it back into.
    const onCommit = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    const committingSpy = vi.fn();
    render(
      <Harness mode="pin" onCommit={onCommit} committingSpy={committingSpy} />,
    );

    await enterPin();

    expect(committingSpy.mock.calls).toEqual([[true]]);
    expect(
      screen.getByRole("button", { name: messages.common.cancel },
      ).hasAttribute("disabled"),
    ).toBe(true);
    // Every digit key too — a fast second tap must not fire a second switch.
    expect(
      screen.getByRole("button", { name: "1" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("surfaces a translated line for a refusal that carries no PIN code", async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error("boom"));
    render(<Harness mode="pin" onCommit={onCommit} />);

    await enterPin();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        messages.family.switchFailed,
      );
    });
    // The server's own words go to the console, never to a family who may be
    // reading the product in another language.
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("SwitchGateBody — the password gate", () => {
  function typePassword(value: string) {
    const field = screen.getByLabelText(messages.common.password);
    fireEvent.change(field, { target: { value } });
    return field;
  }

  it("names the target and refuses to submit an empty field", () => {
    render(<Harness mode="password" onCommit={vi.fn()} />);

    expect(
      screen.getByText(GATE.passwordTitle.replace("{name}", TARGET.first_name)),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: GATE.submit }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("says so inline when the password is wrong, and stays open", async () => {
    const onCommit = vi.fn().mockRejectedValue(refusal(SWITCH_PASSWORD_INVALID));
    render(<Harness mode="password" onCommit={onCommit} />);

    typePassword("hunter2");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: GATE.submit }));
    });

    expect(onCommit).toHaveBeenCalledWith({ password: "hunter2" });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(GATE.passwordInvalid);
    });
    // The field is still there, still holding what was typed: retry is one
    // correction away, and nothing about the session has moved.
    const field: HTMLInputElement = screen.getByLabelText(
      messages.common.password,
    );
    expect(field.value).toBe("hunter2");
    expect(
      screen.getByRole("button", { name: GATE.submit }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("holds the submit disabled through a switch that lands", async () => {
    const onCommit = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    render(<Harness mode="password" onCommit={onCommit} />);

    typePassword("hunter2");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: GATE.submit }));
    });

    expect(
      screen.getByRole("button", { name: GATE.submit }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: messages.common.cancel })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

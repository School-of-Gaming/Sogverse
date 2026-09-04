import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import {
  SwitchGateBody,
  type SwitchGateMode,
} from "@/components/family/SwitchGateDialog";
import {
  SwitchAccountError,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_SIGN_OUT_REQUIRED,
  type FamilyMember,
  type SwitchAccountCredentials,
  type SwitchAccountErrorCode,
} from "@/services/family";

/**
 * What stands between a child and somebody else's account.
 *
 * What is worth pinning here is not the markup but the endings, because each is
 * a promise the route already makes and the UI has to match: a wrong PIN never
 * navigates and never signs anybody out, a family that holds no PIN is told so
 * instead of being asked to type more carefully, a switch that lands keeps every
 * control disabled right through the navigation it causes — and a session that
 * cannot switch at all is handed the canonical sign-out rather than a credential
 * box that would refuse whatever was typed into it.
 */

// A real, generated UUID — the same discipline every fixture person gets, so
// this one can be handed to an avatar-bearing surface unchanged.
const TARGET: FamilyMember = {
  id: "3b41f7dc-0b4a-4a2b-9a2e-9b0f1b7c6d21",
  role: "customer",
  first_name: "Riikka",
  sign_in: null,
};

/**
 * A sibling whose account has no login at all — reached by an account switch
 * from the parent and by nothing else. "Sign in as them" names an action that
 * does not exist for this target, which is what the branched sentence is for.
 */
const PARENT_MODE_SIBLING: FamilyMember = {
  id: "b52efb5b-b359-4612-aace-759a602117e8",
  role: "gamer",
  first_name: "Eero",
  sign_in: "parent",
};

/** A sibling who does hold a credential, so the direct advice is true of them. */
const USERNAME_MODE_SIBLING: FamilyMember = {
  id: "b3b57dc5-26c1-4918-9e07-564511a9eff9",
  role: "gamer",
  first_name: "Lily",
  sign_in: "username",
};

/** The child whose session it is — the sign-out copy is about them. */
const VIEWER_FIRST_NAME = "Aino";

const GATE = messages.family.switchGate;

/** The English string with its one placeholder filled, as the reader sees it. */
function copy(template: string, name: string) {
  return template.replaceAll("{name}", name);
}

/**
 * Drives the controlled `committing` pair the way both hosts do, and reports
 * what it ended up holding — the flag is the loading contract, and the whole
 * point of the success case is that it is never handed back.
 */
function Harness({
  mode,
  onCommit,
  committingSpy,
  target = TARGET,
}: {
  mode: SwitchGateMode;
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
  committingSpy?: (value: boolean) => void;
  /** Who the switch was reaching for; defaults to the parent every other case uses. */
  target?: FamilyMember;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <Stateful
        mode={mode}
        onCommit={onCommit}
        committingSpy={committingSpy}
        target={target}
      />
    </NextIntlClientProvider>
  );
}

function Stateful({
  mode,
  onCommit,
  committingSpy,
  target,
}: {
  mode: SwitchGateMode;
  onCommit: (credentials: SwitchAccountCredentials) => Promise<void>;
  committingSpy?: (value: boolean) => void;
  target: FamilyMember;
}) {
  const [committing, setCommitting] = useState(false);
  return (
    <SwitchGateBody
      target={target}
      viewerFirstName={VIEWER_FIRST_NAME}
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

  it("drops the pad when the route says this session has to sign out instead", async () => {
    // The helper and the route are the same rule, so this should not happen —
    // but the route is the boundary, and a child left typing digits nothing
    // will ever accept is the worst way to be told.
    const onCommit = vi
      .fn()
      .mockRejectedValue(refusal(SWITCH_SIGN_OUT_REQUIRED));
    render(<Harness mode="pin" onCommit={onCommit} />);

    await enterPin();

    expect(screen.getByText(GATE.signOutTitle)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });
});

describe("SwitchGateBody — the sign-out gate", () => {
  /** The form the sign-out button submits, found through that button. */
  function signOutForm() {
    return screen
      .getByRole("button", { name: messages.common.signOut })
      .closest("form");
  }

  it("explains whose session this is and what to do", () => {
    render(<Harness mode="signOut" onCommit={vi.fn()} />);

    expect(screen.getByText(GATE.signOutTitle)).toBeTruthy();
    // The viewer is the subject of the first sentence, the target of the last:
    // this session is Aino's, and the account she is reaching for is Riikka's.
    expect(
      screen.getByText(copy(GATE.signOutOwnSession, VIEWER_FIRST_NAME)),
    ).toBeTruthy();
    expect(
      screen.getByText(copy(GATE.signOutHow, TARGET.first_name)),
    ).toBeTruthy();
  });

  it("routes through the parent for a target that has no login of its own", () => {
    render(
      <Harness mode="signOut" onCommit={vi.fn()} target={PARENT_MODE_SIBLING} />,
    );

    // A `parent`-mode sibling is reached by a switch and by nothing else, so
    // "sign in as them" would name a login that does not exist.
    expect(
      screen.getByText(
        copy(GATE.signOutHowViaParent, PARENT_MODE_SIBLING.first_name),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(copy(GATE.signOutHow, PARENT_MODE_SIBLING.first_name)),
    ).toBeNull();
  });

  it("keeps the direct advice for a target that does hold a login", () => {
    render(
      <Harness mode="signOut" onCommit={vi.fn()} target={USERNAME_MODE_SIBLING} />,
    );

    expect(
      screen.getByText(copy(GATE.signOutHow, USERNAME_MODE_SIBLING.first_name)),
    ).toBeTruthy();
  });

  it("collects nothing and commits nothing — there is no credential to send", () => {
    const onCommit = vi.fn();
    render(<Harness mode="signOut" onCommit={onCommit} />);

    // No pad, no password box: the route would refuse whatever was typed, so
    // asking for it would be a question with no answer.
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("offers the canonical sign-out: a form POST to the sign-out route", () => {
    render(<Harness mode="signOut" onCommit={vi.fn()} />);

    const form = signOutForm();
    // Not a fetch and not a router push. The route answers 303 and the browser
    // follows it as a full-page GET, which is the only thing that rebuilds the
    // browser Supabase client from the new cookies.
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/signout");
    // The header's sign-out lands at home; this one asks the route for the
    // login page, since its whole point is signing in as someone else.
    const next = form?.querySelector<HTMLInputElement>('input[name="next"]');
    expect(next?.type).toBe("hidden");
    expect(next?.value).toBe("/login");
  });

  it("orders the footer [Cancel, Sign out] so the affirmative is last in the DOM", () => {
    render(<Harness mode="signOut" onCommit={vi.fn()} />);

    // Last in the DOM is rightmost in a row and, under `flex-col-reverse`,
    // topmost in a stack — one authoring shape for both layouts.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      messages.common.cancel,
      messages.common.signOut,
    ]);
  });

  it("cancels back to the caller without signing anything out", () => {
    render(<Harness mode="signOut" onCommit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: messages.common.cancel }));

    expect(onClose).toHaveBeenCalled();
    // A `type="button"` cancel inside a form is what stops the click from
    // submitting the sign-out it sits beside.
    expect(
      screen
        .getByRole("button", { name: messages.common.cancel })
        .getAttribute("type"),
    ).toBe("button");
  });

  it("holds both buttons disabled from the submit onward", () => {
    render(<Harness mode="signOut" onCommit={vi.fn()} />);

    const form = signOutForm();
    // jsdom does not navigate, so the submit is cancelled here — but the
    // component's own `onSubmit` has already run, which is the flag under test.
    // In a browser nothing clears it either: the 303 unloads the document.
    fireEvent.submit(form!);

    expect(
      screen
        .getByRole("button", { name: messages.common.signOut })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: messages.common.cancel })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

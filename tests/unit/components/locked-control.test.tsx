import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  LockedButton,
  isLocked,
  lockOf,
  type LockExplanation,
} from "@/components/ui/locked-control";

/**
 * The locked control: the real control, a padlock, and an explanation on
 * press — never the action, and never a disabled button a keyboard cannot
 * reach or ask about.
 */

const EXPLANATION: LockExplanation = {
  title: "Sending to parents",
  what: "Emails this session’s report to every family in the group.",
  why: "Assigned Gedus can do this. You’re on this group as a trainee.",
  dismiss: "Got it",
  lockedHint: "(locked)",
};

afterEach(cleanup);

function lockedButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Send", description: "(locked)" });
}

describe("LockedButton", () => {
  it("is an enabled, focusable button that keeps its name and says it is locked", () => {
    render(<LockedButton explanation={EXPLANATION}>Send</LockedButton>);
    const button = lockedButton();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("explains what it does and why on press, and closes on dismiss", () => {
    render(<LockedButton explanation={EXPLANATION}>Send</LockedButton>);
    expect(screen.queryByText(EXPLANATION.what)).toBeNull();

    fireEvent.click(lockedButton());
    expect(screen.getByText(EXPLANATION.title)).toBeTruthy();
    expect(screen.getByText(EXPLANATION.what)).toBeTruthy();
    expect(screen.getByText(EXPLANATION.why)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(EXPLANATION.what)).toBeNull();
  });
});

describe("isLocked / lockOf", () => {
  it("tells a lock from a write, and yields the lock's words", () => {
    const write = () => undefined;
    expect(isLocked(write)).toBe(false);
    expect(isLocked(undefined)).toBe(false);
    expect(isLocked({ locked: EXPLANATION })).toBe(true);
    expect(lockOf(write)).toBeNull();
    expect(lockOf({ locked: EXPLANATION })).toBe(EXPLANATION);
  });
});

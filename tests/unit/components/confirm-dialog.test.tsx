import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * ============================================================================
 * The shared confirm dialog, in its two modes
 * ============================================================================
 *
 * The dialog answers one question — "does the person need the outcome before
 * they move on?" — and the caller answers it, explicitly, with
 * `holdWhileCommitting`. The two modes are different enough that most of what
 * is worth pinning here is the boundary between them:
 *
 *   - **closing** — `onConfirm` runs and the dialog is gone in the same tick,
 *     which is what lets a caller's own committing flag be live before its next
 *     render. A handler that happens to be asynchronous changes nothing: the
 *     mode is what the caller asked for, never something inferred from a return
 *     value.
 *   - **holding** — the latch goes up before the write does, nothing on the
 *     dialog may be pressed while it is in the air, and no close path may
 *     abandon it. A resolved write takes the dialog away without ever handing
 *     the button back; a refused one keeps the dialog up and says why, in front
 *     of the button that caused it rather than behind it.
 *
 * `container` is the harness's own DOM and the dialog is a portal into
 * `document.body`, which is what makes "inside the dialog" a real assertion
 * here rather than a reading of the markup.
 */

const TITLE = "Withdraw the request";
const CONFIRM = "Withdraw";
const CANCEL = messages.common.cancel;
const FAILED = "That did not go through. Try again.";

/** A deferred, so a write can be held open and then let go inside `act`. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
} {
  let resolve: () => void = () => {};
  let reject: () => void = () => {};
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    // The rejection is swallowed by the dialog, which is the point — nothing
    // here needs the reason.
    reject = () => fail(new Error("refused"));
  });
  return { promise, resolve, reject };
}

function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled");
}

function confirmButton(): HTMLElement {
  return screen.getByRole("button", { name: CONFIRM });
}

function cancelButton(): HTMLElement {
  return screen.getByRole("button", { name: CANCEL });
}

/** The primitive's backdrop, which is the other way a dialog is dismissed. */
function backdrop(): Element {
  const element = document.querySelector(".bg-scrim");
  if (element === null) throw new Error("the dialog drew no backdrop");
  return element;
}

/**
 * The shape every caller has: the open state is the caller's, and the dialog
 * asks for it to change rather than changing it.
 */
function Harness({
  onConfirm,
  holdWhileCommitting = false,
  onOpen,
}: {
  onConfirm: () => Promise<void>;
  holdWhileCommitting?: boolean;
  /** Called with every open state the dialog asks for, as it asks for it. */
  onOpen?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  const handleOpenChange = (next: boolean) => {
    onOpen?.(next);
    setOpen(next);
  };

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {holdWhileCommitting ? (
        <ConfirmDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={TITLE}
          description="Everyone who offered is told."
          confirmLabel={CONFIRM}
          holdWhileCommitting
          describeError={() => FAILED}
          onConfirm={onConfirm}
        />
      ) : (
        <ConfirmDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={TITLE}
          description="Everyone who offered is told."
          confirmLabel={CONFIRM}
          // The closing mode's handler returns nothing. This one *does* return
          // a promise at runtime, which is exactly what the case below is
          // about — TypeScript lets a promise-returning function stand where a
          // `() => void` is asked for.
          onConfirm={onConfirm}
        />
      )}
    </NextIntlClientProvider>
  );
}

describe("the confirm dialog, closing on the press", () => {
  it("runs onConfirm before it asks to close, in the same tick", () => {
    const order: string[] = [];
    render(
      <Harness
        onConfirm={() => {
          order.push("confirm");
          return Promise.resolve();
        }}
        onOpen={(open) => order.push(`open:${String(open)}`)}
      />,
    );

    fireEvent.click(confirmButton());

    // Nothing is awaited: both have happened by the time the click returns,
    // and in this order — which is what lets a caller's own committing flag be
    // live in the first render after the press.
    expect(order).toEqual(["confirm", "open:false"]);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("closes on Escape and on the backdrop", () => {
    // The control for the holding mode's refusals below: both paths reach the
    // caller when there is no write to protect.
    const asked = vi.fn();
    const { unmount } = render(
      <Harness onConfirm={() => Promise.resolve()} onOpen={asked} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(asked).toHaveBeenCalledWith(false);
    unmount();

    const askedAgain = vi.fn();
    render(<Harness onConfirm={() => Promise.resolve()} onOpen={askedAgain} />);
    fireEvent.click(backdrop());
    expect(askedAgain).toHaveBeenCalledWith(false);
  });

  it("closes on a handler that happens to be asynchronous", async () => {
    // The mode is the caller's explicit choice, never inferred: a promise
    // coming back from a closing-mode handler is nothing to the dialog.
    const write = deferred();
    render(<Harness onConfirm={() => write.promise} />);

    fireEvent.click(confirmButton());
    expect(screen.queryByText(TITLE)).toBeNull();

    await act(async () => {
      write.resolve();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

describe("the confirm dialog, holding until the write settles", () => {
  it("stays up with both buttons refusing presses while the write is in the air", () => {
    const write = deferred();
    render(<Harness holdWhileCommitting onConfirm={() => write.promise} />);

    fireEvent.click(confirmButton());

    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(isDisabled(confirmButton())).toBe(true);
    expect(isDisabled(cancelButton())).toBe(true);
  });

  it("refuses Escape and the backdrop while the write is in the air", () => {
    const write = deferred();
    const asked = vi.fn();
    render(
      <Harness
        holdWhileCommitting
        onConfirm={() => write.promise}
        onOpen={asked}
      />,
    );

    fireEvent.click(confirmButton());
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(backdrop());

    // Neither reached the caller, so neither could have taken the dialog away
    // before its outcome was known.
    expect(asked).not.toHaveBeenCalled();
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it("fires the write once however many times the button is pressed", () => {
    const write = deferred();
    const onConfirm = vi.fn(() => write.promise);
    render(<Harness holdWhileCommitting onConfirm={onConfirm} />);

    const button = confirmButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes once on a resolved write, with the button still disabled", async () => {
    const write = deferred();
    const seen: { open: boolean; confirmDisabled: boolean }[] = [];
    render(
      <Harness
        holdWhileCommitting
        onConfirm={() => write.promise}
        onOpen={(open) => {
          // Read at the moment the close is asked for: the button must not
          // have come back to life in the frame before the dialog goes.
          seen.push({ open, confirmDisabled: isDisabled(confirmButton()) });
        }}
      />,
    );

    fireEvent.click(confirmButton());
    await act(async () => {
      write.resolve();
    });

    expect(seen).toEqual([{ open: false, confirmDisabled: true }]);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("stays up, hands the buttons back and names the failure inside itself", async () => {
    const write = deferred();
    const asked = vi.fn();
    const { container } = render(
      <Harness
        holdWhileCommitting
        onConfirm={() => write.promise}
        onOpen={asked}
      />,
    );

    fireEvent.click(confirmButton());
    await act(async () => {
      write.reject();
    });

    expect(asked).not.toHaveBeenCalled();
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(isDisabled(confirmButton())).toBe(false);
    expect(isDisabled(cancelButton())).toBe(false);

    // In the dialog's portal, not in the page the dialog is standing over —
    // a refusal drawn behind the overlay is a refusal nobody reads.
    expect(screen.getByRole("alert").textContent).toBe(FAILED);
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("lets the retry through, on a dialog that has already been refused once", async () => {
    const first = deferred();
    const second = deferred();
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<Harness holdWhileCommitting onConfirm={onConfirm} />);

    fireEvent.click(confirmButton());
    await act(async () => {
      first.reject();
    });

    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(2);
    // The failure from the first attempt is gone the moment the second starts:
    // it describes a press that has been superseded.
    expect(screen.queryByText(FAILED)).toBeNull();

    await act(async () => {
      second.resolve();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("opens clean after a write it held for", async () => {
    // The caller keeps the dialog mounted across opens, so a latch or a failure
    // surviving the close would meet the next press already set.
    const write = deferred();
    function Reopenable() {
      const [open, setOpen] = useState(true);
      return (
        <NextIntlClientProvider locale="en" messages={messages}>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title={TITLE}
            confirmLabel={CONFIRM}
            holdWhileCommitting
            describeError={() => FAILED}
            onConfirm={() => write.promise}
          />
        </NextIntlClientProvider>
      );
    }
    render(<Reopenable />);

    fireEvent.click(confirmButton());
    await act(async () => {
      write.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(isDisabled(confirmButton())).toBe(false);
    expect(isDisabled(cancelButton())).toBe(false);
  });
});

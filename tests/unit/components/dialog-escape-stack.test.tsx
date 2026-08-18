import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * **Escape closes the dialog on top, and only that one.**
 *
 * Every open dialog listens on `document`, because a dialog is a portal and has
 * no focused subtree to hang a handler off. With one dialog that is fine; with
 * two it means one keypress reaches both listeners, and the picker a parent
 * opened from inside a form dialog takes the form down with it — losing the
 * half-finished thing they were standing in front of.
 *
 * These pin the register that fixes it: which dialog answers a keypress, that a
 * lone dialog is unaffected, and that a dialog leaving from the middle of the
 * stack takes its own entry with it rather than somebody else's.
 */

const escape = () => fireEvent.keyDown(document, { key: "Escape" });
const showing = (text: string) => document.body.textContent.includes(text);

/** A dialog whose body can open a second one, exactly as the real nesting does. */
function Nested({ onCloseInner }: { onCloseInner?: boolean }) {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <Dialog open={outer} onOpenChange={setOuter}>
      <DialogContent>
        <p>outer body</p>
        <button type="button" onClick={() => setInner(true)}>
          open inner
        </button>
        <Dialog open={inner} onOpenChange={setInner}>
          <DialogContent>
            <p>inner body</p>
            {onCloseInner === true && (
              <button type="button" onClick={() => setInner(false)}>
                close inner
              </button>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

const openInner = () => {
  const button = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "open inner",
  );
  fireEvent.click(button!);
};

describe("a single dialog", () => {
  it("still closes on Escape", () => {
    function Alone() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <p>only body</p>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Alone />);
    expect(showing("only body")).toBe(true);
    escape();
    expect(showing("only body")).toBe(false);
  });
});

describe("nested dialogs", () => {
  it("closes the inner one and leaves its host standing", () => {
    render(<Nested />);
    openInner();
    expect(showing("inner body")).toBe(true);

    escape();
    expect(showing("inner body")).toBe(false);
    expect(showing("outer body")).toBe(true);
  });

  it("closes the outer one on the second Escape", () => {
    render(<Nested />);
    openInner();
    escape();
    escape();
    expect(showing("outer body")).toBe(false);
  });

  it("hands Escape back to the host when the inner one closes another way", () => {
    // The unregister path: the inner dialog leaves without a keypress, and the
    // next Escape has to reach the outer one. A register that removed the wrong
    // entry — or none — would leave the outer dialog deaf or double-closing.
    render(<Nested onCloseInner />);
    openInner();
    const close = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "close inner",
    );
    fireEvent.click(close!);
    expect(showing("inner body")).toBe(false);

    escape();
    expect(showing("outer body")).toBe(false);
  });
});

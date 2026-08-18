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
 *
 * **One of them is the case the depth context exists for**, and it is the only
 * one a last-registered-wins register would fail: a nested pair that opens in a
 * *single commit*. React runs a child's effects before its parent's, so the
 * inner dialog registers first there — registration order says the outer one is
 * on top, and it is wrong. Every other case here passes either way, which is
 * why that one has to be present or the whole mechanism is untested.
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

const aloneClosesOnEscape = () => {
  render(<Alone />);
  expect(showing("only body")).toBe(true);
  escape();
  expect(showing("only body")).toBe(false);
};

describe("a single dialog", () => {
  it("still closes on Escape", aloneClosesOnEscape);
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

  /**
   * **The case depth exists for.** Both dialogs mount in one commit, so React
   * runs the inner one's effect first and it registers first. A register that
   * answered the keypress with its most recent entry would hand Escape to the
   * *outer* dialog and take the whole pair down — which is precisely the bug
   * the register was added to prevent, arriving by a different route. Depth is
   * read from the tree, so the inner dialog is deeper whatever order the
   * effects ran in.
   */
  it("gives Escape to the inner one even when both open in one commit", () => {
    function BothAtOnce() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(true);
      return (
        <Dialog open={outer} onOpenChange={setOuter}>
          <DialogContent>
            <p>outer body</p>
            <Dialog open={inner} onOpenChange={setInner}>
              <DialogContent>
                <p>inner body</p>
              </DialogContent>
            </Dialog>
          </DialogContent>
        </Dialog>
      );
    }
    render(<BothAtOnce />);
    expect(showing("inner body")).toBe(true);
    expect(showing("outer body")).toBe(true);

    escape();
    expect(showing("inner body")).toBe(false);
    expect(showing("outer body")).toBe(true);
  });
});

/**
 * **The register is module-level, so a leak is a cross-test fault**, and the
 * lone-dialog case is the one assertion that can see one: an orphaned entry
 * left behind at depth 1 outranks a fresh dialog at depth 0, and its Escape
 * stops working. Running that case *after* every nested test is what turns a
 * leaked entry into a visible failure here rather than into a mystery in
 * whichever file happens to run next.
 */
describe("the register is left empty", () => {
  it("still closes a lone dialog after all the nesting above", aloneClosesOnEscape);
});

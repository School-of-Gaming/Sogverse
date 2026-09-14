import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TopicPrepDialog } from "@/components/topic-prep/TopicPrepDialog";
import { resolveTopicPrep } from "@/lib/products/topics";
import type { TopicPrepPlan } from "@/lib/products/topics";

/**
 * The guide's overlay, and the one asymmetry it exists to hold: two footer
 * buttons, two outcomes, and only the affirmative reporting a dismissal.
 *
 * The enrolment card's own suite covers what a dismissal then does to the card.
 * What only this component can answer is that leaving without answering is a
 * control a reader can see and press, that pressing it reports nothing, and
 * that the two buttons sit in the order every dialog in the app uses — the
 * negative first in the DOM, the affirmative last, which is what puts the
 * answer on the right of a row and on top of a stack.
 */

// Keys echo, so an assertion names the copy the dialog reached for rather than
// the wording in messages/.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

const NOT_YET = "topicPrep.notYetLabel";
const READY = "topicPrep.readyLabel";

/**
 * A one-step guide: a label-only topic on a remote product, which is the
 * smallest real plan the resolver produces. Resolved rather than hand-built so
 * the fixture cannot drift from the shape a surface actually passes.
 */
function remoteOnlyPlan(): TopicPrepPlan {
  const plan = resolveTopicPrep("esports", true);
  if (!plan) throw new Error("a remote product always has a guide");
  return plan;
}

function renderDialog() {
  const onReady = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TopicPrepDialog
      open
      onOpenChange={onOpenChange}
      plan={remoteOnlyPlan()}
      onReady={onReady}
    />,
  );
  return { onReady, onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TopicPrepDialog", () => {
  it("closes without reporting a dismissal when the family is not yet ready", () => {
    const { onReady, onOpenChange } = renderDialog();

    act(() => {
      screen.getByRole("button", { name: NOT_YET }).click();
    });

    expect(onReady).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports the dismissal and then closes when the family says they are ready", () => {
    const { onReady, onOpenChange } = renderDialog();

    act(() => {
      screen.getByRole("button", { name: READY }).click();
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("puts the negative first in the DOM and the affirmative last", () => {
    renderDialog();

    const order = screen.getByRole("button", { name: NOT_YET }).compareDocumentPosition(
      screen.getByRole("button", { name: READY }),
    );

    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

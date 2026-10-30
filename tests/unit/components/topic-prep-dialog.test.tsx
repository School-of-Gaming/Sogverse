import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TopicPrepDialog } from "@/components/topic-prep/TopicPrepDialog";
import { resolveTopicPrep } from "@/lib/products/topic-prep";
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
  const plan = resolveTopicPrep("esports", "online");
  if (!plan) throw new Error("a remote product always has a guide");
  return plan;
}

function renderDialog(plan: TopicPrepPlan = remoteOnlyPlan()) {
  const onReady = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TopicPrepDialog
      open
      onOpenChange={onOpenChange}
      plan={plan}
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

  it("draws the supplied note alone, with no list and no closing", () => {
    const plan = resolveTopicPrep("minecraft_java", "in_person");
    if (!plan) throw new Error("in-person Minecraft has a note");
    renderDialog(plan);

    expect(screen.getByText("topicPrep.suppliedInPersonNote")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("topicPrep.closing")).toBeNull();
    // The dialog's own frame is unchanged: the two answers are still there.
    expect(screen.getByRole("button", { name: READY })).toBeTruthy();
    expect(screen.getByRole("button", { name: NOT_YET })).toBeTruthy();
  });

  it("draws a hybrid guide as two lists under the home heading, numbering each from one", () => {
    const plan = resolveTopicPrep("roblox_studio", "hybrid");
    if (!plan) throw new Error("a hybrid product always has a guide");
    renderDialog(plan);

    expect(screen.getByText("topicPrep.hybridIntro")).toBeTruthy();
    const heading = screen.getByRole("heading", {
      name: "topicPrep.homeHeading",
      level: 3,
    });
    const lists = screen.getAllByRole("list").filter((el) => el.tagName === "OL");
    expect(lists).toHaveLength(2);

    const [first, second] = lists;
    expect(
      first.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      heading.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(first.textContent).toContain("topicPrep.steps.venueVoiceRoom.title");
    expect(second.textContent).toContain("topicPrep.steps.remoteSession.title");
    expect(second.textContent).not.toContain("topicPrep.steps.venueVoiceRoom.title");
  });
});

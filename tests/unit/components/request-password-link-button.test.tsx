import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { RequestPasswordLinkButton } from "@/components/auth/request-password-link-button";

/**
 * ============================================================================
 * The one button a child presses to be sent a password link.
 * ============================================================================
 *
 * The mail it asks for carries a recovery token, and the reader is a child on a
 * page they reached from their inbox — so what is pinned here is what happens
 * *between* renders:
 *
 *  - the button is disabled from the press onward, before anything resolves;
 *  - a send that landed leaves it disabled for good. The link is already on its
 *    way; a second copy gives the child two links to choose between, and a
 *    button that came back to life invites a press while they wait;
 *  - a send that failed hands it back, because nothing arrived and trying again
 *    is the only useful thing left;
 *  - the outcome sentence is the last thing in the block, under the page's own
 *    escape hatch, so its arrival pushes nothing that was already painted.
 *
 * The lock is a property of this component and of nothing else — the route
 * decides for itself what a second request means.
 */

const ADDRESS = "lily@example.test";
const copy = messages.verifyEmail;

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RequestPasswordLinkButton email={ADDRESS}>
        <a href="/login">{messages.common.signIn}</a>
      </RequestPasswordLinkButton>
    </NextIntlClientProvider>,
  );
}

function theButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button");
}

/** Let the request's promise and everything chained to it settle. */
async function settle() {
  await act(async () => {});
}

/** The stubbed `fetch`, so a test can read what the component asked for. */
let fetchMock: ReturnType<typeof stubFetch>;

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

const landsFine = () => Promise.resolve(new Response(null, { status: 200 }));

beforeEach(() => {
  fetchMock = stubFetch(landsFine);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("asking for the link", () => {
  it("posts the address to the forgot-password route", async () => {
    renderButton();

    fireEvent.click(theButton());
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/forgot-password");
    expect(JSON.parse(String(init.body))).toEqual({ email: ADDRESS });
  });

  // Disabled before anything resolves, not after — the gap between the press
  // and the answer is exactly where a second press lands.
  it("is disabled while the request is in the air", async () => {
    let land: (response: Response) => void = () => {};
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          land = resolve;
        }),
    );
    renderButton();

    fireEvent.click(theButton());

    expect(theButton().disabled).toBe(true);
    expect(theButton().textContent).toBe(messages.common.sending);

    land(new Response(null, { status: 200 }));
    await settle();
  });
});

describe("once the link has gone", () => {
  it("stays disabled for good", async () => {
    renderButton();

    fireEvent.click(theButton());
    await settle();

    expect(screen.getByText(copy.gamerPasswordLinkSent)).toBeTruthy();
    expect(theButton().disabled).toBe(true);
    // The locked button reads as the thing that was pressed, not as one still
    // working: "Sending" belongs to the flight and ends with it.
    expect(theButton().textContent).toBe(copy.gamerSendPasswordLink);
  });

  it("cannot be pressed a second time", async () => {
    renderButton();

    fireEvent.click(theButton());
    await settle();
    fireEvent.click(theButton());
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The sentence is the last thing in the block. The page's own way out is
   * handed in as a child and rendered above it, so the reveal lands in the
   * slack at the bottom and moves nothing (root `CLAUDE.md`, "Layout &
   * Scrolling").
   */
  it("reveals the outcome below the page's escape hatch", async () => {
    renderButton();

    fireEvent.click(theButton());
    await settle();

    const link = screen.getByRole("link");
    const sentence = screen.getByText(copy.gamerPasswordLinkSent);
    expect(
      Boolean(
        link.compareDocumentPosition(sentence) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      "the outcome sentence must come after everything already on screen",
    ).toBe(true);
  });
});

describe("when the send fails", () => {
  it("hands the button back so the child can try again", async () => {
    fetchMock = stubFetch(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    renderButton();

    fireEvent.click(theButton());
    await settle();

    expect(screen.getByText(copy.gamerPasswordLinkFailed)).toBeTruthy();
    expect(theButton().disabled).toBe(false);

    fireEvent.click(theButton());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A network error and a refused request are the same thing to the reader:
  // nothing arrived.
  it("treats a thrown request the same way", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    renderButton();

    fireEvent.click(theButton());
    await settle();

    expect(screen.getByText(copy.gamerPasswordLinkFailed)).toBeTruthy();
    expect(theButton().disabled).toBe(false);
  });
});

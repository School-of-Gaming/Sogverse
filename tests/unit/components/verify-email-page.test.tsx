import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import type { EmailVerificationRedemption } from "@/lib/email-verification.server";

/**
 * **For a child in `email` mode, verifying is a step rather than a
 * confirmation** — they have no password at all until the address is confirmed —
 * so this page has to say something to them that it says to nobody else: what
 * comes next, and the button that asks for it.
 *
 * What is pinned:
 *
 *  - the page mails nothing. It used to send the password-reset mail during its
 *    own GET, which put a live recovery token on whatever opened the URL — a
 *    reload, a second click, an inbox scanner passing through. The child asks,
 *    and only then does anything go out;
 *  - a first redemption and a revisit are the same page. There is no state for
 *    the reader to be in that the copy has to distinguish, so there is no split;
 *  - the page never prints the address. Anyone holding the link can open it, and
 *    the address belongs to a child;
 *  - every other role and mode goes down the path it always did.
 *
 * The page is an async server component, so it is awaited and rendered to static
 * markup — its one data read is mocked, and the button's own behaviour is pinned
 * next door in `request-password-link-button.test.tsx`.
 */

const redeem = vi.fn<() => Promise<EmailVerificationRedemption>>();
/**
 * Mocked even though the page no longer imports it: this spy is the regression
 * guard for the one thing this page must never do again, and it catches the
 * import coming back rather than describing the code as it stands.
 */
const sendPasswordResetEmail = vi.fn();

vi.mock("@/lib/email-verification.server", () => ({
  redeemEmailVerificationToken: () => redeem(),
}));
vi.mock("@/lib/password-reset.server", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
}));

// `getTranslations` refuses to run outside a server render, and jsdom is not
// one. The stub reads the real `en` catalogue, so the assertions below are still
// against shipped copy rather than echoed keys.
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "verifyEmail" | "common") =>
    Promise.resolve((key: string) => {
      const value: unknown = (messages[namespace] as Record<string, unknown>)[key];
      if (typeof value !== "string") throw new Error(`no ${namespace}.${key}`);
      return value;
    }),
}));

import VerifyEmailPage from "@/app/(auth)/verify-email/page";

const CHILD_ADDRESS = "lily@example.test";

function redemption(
  overrides: Partial<EmailVerificationRedemption>,
): EmailVerificationRedemption {
  return {
    outcome: "verified",
    role: "gamer",
    signIn: "email",
    email: CHILD_ADDRESS,
    ...overrides,
  };
}

async function pageHtml(): Promise<string> {
  const element = await VerifyEmailPage({
    searchParams: Promise.resolve({ token: "a-token" }),
  });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a child confirming their address", () => {
  it("is told what comes next and offered the button that asks for it", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(html).toContain(messages.verifyEmail.gamerVerifiedTitle);
    expect(html).toContain(messages.verifyEmail.gamerChoosePasswordDescription);
    expect(html).toContain(messages.verifyEmail.gamerSendPasswordLink);
  });

  /**
   * The mail carries a recovery token, and a GET that mints one is a credential
   * sent by whatever opened the URL — a reload, a second click, an inbox scanner
   * pre-fetching the link. Rendering this page sends nothing.
   */
  it("mails nothing by being rendered", async () => {
    redeem.mockResolvedValue(redemption({}));

    await pageHtml();

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  // The escape hatch sits beside the button, under it.
  it("offers the way in beneath the button", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(html).toContain(messages.common.signIn);
  });

  it("never prints the address on a page anyone with the link can open", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(html).not.toContain(CHILD_ADDRESS);
  });
});

describe("everybody else", () => {
  it("leaves an adult's verification exactly as it was", async () => {
    redeem.mockResolvedValue(
      redemption({ role: "customer", signIn: null, email: "marja@example.test" }),
    );

    const html = await pageHtml();

    expect(html).toContain(messages.verifyEmail.successTitle);
    expect(html).toContain(messages.verifyEmail.goToDashboard);
  });

  // A switch-only or username-mode child has no mailbox, so this branch can
  // only be reached by a link minted before the mode changed.
  it("shows the plain confirmation for a gamer who is not in email mode", async () => {
    redeem.mockResolvedValue(redemption({ signIn: "username" }));

    const html = await pageHtml();

    expect(html).toContain(messages.verifyEmail.successTitle);
    expect(html).not.toContain(messages.verifyEmail.gamerSendPasswordLink);
  });

  it("shows the dead-link view for a token that does not hold", async () => {
    redeem.mockResolvedValue({
      outcome: "invalid",
      role: null,
      signIn: null,
      email: null,
    });

    const html = await pageHtml();

    expect(html).toContain(messages.verifyEmail.invalidTitle);
  });
});

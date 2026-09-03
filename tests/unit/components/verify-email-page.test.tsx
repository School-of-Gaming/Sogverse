import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import type { EmailVerificationRedemption } from "@/lib/email-verification.server";

/**
 * **For a child in `email` mode, verifying is a step rather than a
 * confirmation** — they have no password at all until the address is confirmed —
 * so this page has to do something for them that it does for nobody else: send
 * the password-reset mail, and say so.
 *
 * What is pinned:
 *
 *  - the send fires exactly once, on the redemption that actually moved the
 *    stamp. A reload, a second click, or an inbox scanner pre-fetching the link
 *    re-renders this page, and each of those minting a fresh recovery token
 *    would be a live credential mailed on a machine's schedule;
 *  - the revisit gets a button instead, so a child whose mail is long gone can
 *    ask — and only then;
 *  - the page never prints the address. Anyone holding the link can open it, and
 *    the address belongs to a child;
 *  - every other role and mode goes down the path it always did.
 *
 * The page is an async server component, so it is awaited and rendered to static
 * markup — its two data reads are the only things mocked, and there is no client
 * behaviour in the branches under test.
 */

const redeem = vi.fn<() => Promise<EmailVerificationRedemption>>();
const sendPasswordResetEmail =
  vi.fn<(args: { email: string; requestHeaders: Headers }) => Promise<void>>();

vi.mock("@/lib/email-verification.server", () => ({
  redeemEmailVerificationToken: () => redeem(),
}));
vi.mock("@/lib/password-reset.server", () => ({
  sendPasswordResetEmail: (args: { email: string; requestHeaders: Headers }) =>
    sendPasswordResetEmail(args),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ host: "sogverse.sog.gg" })),
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
    firstVerification: true,
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
  sendPasswordResetEmail.mockResolvedValue(undefined);
});

describe("a child confirming their address for the first time", () => {
  it("is sent the password link and told to go and open it", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0]).toMatchObject({
      email: CHILD_ADDRESS,
    });
    expect(html).toContain(messages.verifyEmail.gamerVerifiedTitle);
    expect(html).toContain(
      messages.verifyEmail.gamerPasswordLinkSentDescription,
    );
  });

  // The next step is in the inbox we have just written to; a Sign in button
  // would invite a child to try a password they do not have yet.
  it("is offered nothing to click", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(html).not.toContain(messages.verifyEmail.gamerSendPasswordLink);
    expect(html).not.toContain(messages.common.signIn);
  });

  it("never prints the address on a page anyone with the link can open", async () => {
    redeem.mockResolvedValue(redemption({}));

    const html = await pageHtml();

    expect(html).not.toContain(CHILD_ADDRESS);
  });
});

describe("a child opening the same link again", () => {
  it("sends nothing, and offers to send on request instead", async () => {
    redeem.mockResolvedValue(redemption({ firstVerification: false }));

    const html = await pageHtml();

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(html).toContain(messages.verifyEmail.gamerSendPasswordLink);
    expect(html).toContain(
      messages.verifyEmail.gamerPasswordLinkAgainDescription,
    );
  });

  it("still keeps the address off the page", async () => {
    redeem.mockResolvedValue(redemption({ firstVerification: false }));

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

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(html).toContain(messages.verifyEmail.successTitle);
    expect(html).toContain(messages.verifyEmail.goToDashboard);
  });

  // A switch-only or username-mode child has no mailbox, so this branch can
  // only be reached by a link minted before the mode changed.
  it("sends nothing for a gamer who is not in email mode", async () => {
    redeem.mockResolvedValue(redemption({ signIn: "username" }));

    const html = await pageHtml();

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(html).toContain(messages.verifyEmail.successTitle);
  });

  it("shows the dead-link view for a token that does not hold", async () => {
    redeem.mockResolvedValue({
      outcome: "invalid",
      role: null,
      signIn: null,
      email: null,
      firstVerification: false,
    });

    const html = await pageHtml();

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(html).toContain(messages.verifyEmail.invalidTitle);
  });
});

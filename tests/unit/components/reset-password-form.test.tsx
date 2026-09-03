import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { mockSupabaseClient } from "../../setup";

/**
 * **The update-failure copy tells the user what to do next.**
 *
 * Supabase rejects a password identical to the current one (error code
 * "same_password"), and for that case "try again" is a misdirection — retrying
 * the same input can never work. The form maps that one code to copy that says
 * so, and keeps the generic retry message for everything else. What is pinned
 * here is the mapping from the error *code*, never the error message: the
 * messages are English-only prose Supabase is free to reword.
 */

/** The catalogue's own copy, so a wording change cannot hide a regression. */
const COPY = messages.auth.resetPassword;

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResetPasswordForm />
    </NextIntlClientProvider>,
  );
}

/** Fill both password fields and submit, letting the async handler settle. */
async function submitPassword(password: string) {
  fireEvent.change(screen.getByLabelText(messages.common.newPassword), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(messages.common.confirmPassword), {
    target: { value: password },
  });
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: COPY.resetButton }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The form reads the recovery token from the URL at submit time; give it one
  // so it gets past the dead-link guard and to the update under test.
  window.history.replaceState({}, "", "/reset-password?token_hash=test-token");
  mockSupabaseClient.auth.verifyOtp.mockResolvedValue({ error: null });
});

describe("mapping the update failure to copy", () => {
  it('tells the user the password is unchanged on the "same_password" code', async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({
      error: { code: "same_password", message: "New password should be different from the old password." },
    });
    renderForm();

    await submitPassword("hunter2hunter2");

    expect(screen.getByText(COPY.samePassword)).toBeTruthy();
    expect(screen.queryByText(COPY.updateFailed)).toBeNull();
  });

  it("keeps the generic retry message for any other failure", async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({
      error: { code: "unexpected_failure", message: "boom" },
    });
    renderForm();

    await submitPassword("hunter2hunter2");

    expect(screen.getByText(COPY.updateFailed)).toBeTruthy();
    expect(screen.queryByText(COPY.samePassword)).toBeNull();
  });

  /**
   * **The recovery session does not survive its own success.**
   *
   * A session minted by `verifyOtp({ type: "recovery" })` carries `otp` in its
   * `amr` claim and no `password` method — and the switch gate reads exactly
   * that claim to decide how a session was made, treating one with no password
   * method as a *family* session, which may reach a linked account on a PIN
   * alone. Leaving it live would therefore hand that standing to whoever worked
   * through the inbox. Signing it out is what keeps the classification honest,
   * and it costs the user a sign-in they were being sent to do anyway.
   */
  it("signs the recovery session out before pointing at the login page", async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({ error: null });
    mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });
    renderForm();

    await submitPassword("a-long-enough-password");

    expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone when the update itself failed", async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({
      error: { code: "same_password", message: "New password should be different" },
    });
    renderForm();

    await submitPassword("a-long-enough-password");

    expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled();
  });

  it("swaps to the success card when the update goes through", async () => {
    mockSupabaseClient.auth.updateUser.mockResolvedValue({ error: null });
    mockSupabaseClient.auth.signOut.mockResolvedValue({ error: null });
    renderForm();

    await submitPassword("hunter2hunter2");

    expect(screen.getByText(COPY.successTitle)).toBeTruthy();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { DiscordLinkConfirm } from "@/components/discord-link/discord-link";

/**
 * The confirm card turns the route's answer into the state the reader acts
 * on: linked, a dead link that sends them back to Discord, or a failure they
 * can retry from the same card. The real catalogue, because the copy is what
 * tells the states apart.
 */

const COPY = messages.discordLink;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function renderCard(role: "gedu" | "admin" = "gedu") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DiscordLinkConfirm token="tok-1" role={role} />
    </NextIntlClientProvider>,
  );
}

function answer(status: number, body: unknown) {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function press() {
  fireEvent.click(screen.getByRole("button", { name: COPY.confirm.action }));
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("the Discord link confirm card", () => {
  it("posts the token only when the button is pressed", async () => {
    answer(200, { discordUsername: "kyle_sog" });
    renderCard();

    expect(mockFetch).not.toHaveBeenCalled();
    press();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/discord/link",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "tok-1" }) }),
    );
    // Let the answer land inside the test that caused it.
    await screen.findByRole("heading", { name: "Linked to @kyle_sog" });
  });

  it("shows a Gedu the linked account and the way to My SOG", async () => {
    answer(200, { discordUsername: "kyle_sog" });
    renderCard("gedu");
    press();

    expect(
      await screen.findByRole("heading", { name: "Linked to @kyle_sog" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: COPY.linked.goToMySog }).getAttribute("href")).toBe(
      "/gedu",
    );
  });

  it("sends an admin to the admin dashboard", async () => {
    answer(200, { discordUsername: "kyle_sog" });
    renderCard("admin");
    press();

    expect(
      (await screen.findByRole("link", { name: COPY.linked.goToDashboard })).getAttribute("href"),
    ).toBe("/admin");
  });

  it("sends the reader back to Discord for a used token", async () => {
    answer(404, { error: "Not found", code: "DISCORD_LINK_TOKEN_NOT_FOUND" });
    renderCard();
    press();

    expect(await screen.findByRole("heading", { name: COPY.used.title })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sends the reader back to Discord for an expired token", async () => {
    answer(410, { error: "Internal server error", code: "DISCORD_LINK_TOKEN_EXPIRED" });
    renderCard();
    press();

    expect(await screen.findByRole("heading", { name: COPY.expired.title })).toBeTruthy();
  });

  it("keeps the card and its button for any other failure", async () => {
    answer(500, { error: "Internal server error" });
    renderCard();
    press();

    expect(await screen.findByText(COPY.confirm.failed)).toBeTruthy();
    const button = screen.getByRole("button", { name: COPY.confirm.action });
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});

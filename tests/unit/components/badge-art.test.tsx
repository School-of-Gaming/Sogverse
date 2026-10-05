import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { BadgeArt } from "@/components/badges/badge-art";
import { GEDU_BADGES } from "@/services/gedu/gedu-badges.service";
import type { GeduBadge } from "@/types";

/**
 * The art slot's two promises to every caller: a badge names itself — so a
 * screen reader hears whether it is earned, which a sighted reader gets from
 * the colour — and an unearned badge is drawn greyed and still.
 */
function renderArt(badge: GeduBadge, earned: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BadgeArt badge={badge} earned={earned} />
    </NextIntlClientProvider>,
  );
}

describe("BadgeArt", () => {
  it.each(GEDU_BADGES)("names the earned %s badge by its own name", (badge) => {
    renderArt(badge, true);
    const name = messages.badges.gedu[badge].name;
    expect(screen.getByRole("img", { name: `${name} badge` })).toBeTruthy();
  });

  it("says when a badge is not yet earned", () => {
    renderArt("flagship", false);
    expect(
      screen.getByRole("img", { name: "Flagship badge, not yet earned" }),
    ).toBeTruthy();
  });

  it("greys an unearned badge and leaves an earned one in colour", () => {
    const { unmount } = renderArt("neuroinclusive", false);
    expect(screen.getByRole("img").className).toContain("grayscale");
    unmount();

    renderArt("neuroinclusive", true);
    expect(screen.getByRole("img").className).not.toContain("grayscale");
  });

  it("never animates an unearned badge", () => {
    const { container } = renderArt("neuroinclusive", false);
    expect(container.innerHTML).not.toMatch(/animate-|transition/);
  });
});

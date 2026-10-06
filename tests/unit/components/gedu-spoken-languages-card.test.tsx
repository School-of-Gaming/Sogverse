import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { createMockProfile } from "../../mocks/supabase";
import type { Profile, ProfileUpdate } from "@/types";

/**
 * The admin's editor for a Gedu's spoken languages: it paints the stored
 * languages from the page's seed, saves the ticked set as a profile update, and
 * refreshes both the profile and the people lists — the lists carry the
 * languages the gedu picker warns from.
 */

const GEDU_ID = "6f1d3c52-8a7e-4d0b-9c41-2e5b7a9f3d18";

let stored: Profile;
const getProfile = vi.fn(async () => stored);
const updateProfile = vi.fn(async (_id: string, updates: ProfileUpdate) => {
  stored = { ...stored, ...updates } as Profile;
  return stored;
});

vi.mock("@/services/users/users.service", () => ({
  UsersService: class {
    getProfile = getProfile;
    updateProfile = updateProfile;
  },
}));

import { GeduSpokenLanguagesCard } from "@/components/admin/gedu-spoken-languages-card";
import { userKeys } from "@/services/users";

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Helsinki">
        <GeduSpokenLanguagesCard geduId={GEDU_ID} initialProfile={stored} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { invalidate };
}

// The flag's title is part of each box's accessible name, beside the label.
const NAMES = { Finnish: /Finnish/, English: /English/ } as const;

function box(name: keyof typeof NAMES): HTMLInputElement {
  const found = screen.getByRole("checkbox", { name: NAMES[name] });
  if (!(found instanceof HTMLInputElement)) throw new Error("not an input");
  return found;
}

function saveButton(): HTMLButtonElement {
  const found = screen.getByRole("button", { name: "Save" });
  if (!(found instanceof HTMLButtonElement)) throw new Error("not a button");
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = createMockProfile({ id: GEDU_ID, role: "gedu", spoken_languages: ["fi"] });
});

describe("GeduSpokenLanguagesCard", () => {
  it("paints the Gedu's stored languages ticked, with nothing to save", () => {
    renderCard();

    expect(box("Finnish").checked).toBe(true);
    expect(box("English").checked).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });

  it("saves the ticked set and refreshes the profile and the people lists", async () => {
    const { invalidate } = renderCard();

    fireEvent.click(box("English"));
    expect(saveButton().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(updateProfile).toHaveBeenCalledTimes(1);
    const [id, updates] = updateProfile.mock.calls[0];
    expect(id).toBe(GEDU_ID);
    expect(new Set(updates.spoken_languages)).toEqual(new Set(["fi", "en"]));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.detail(GEDU_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.lists() });

    await waitFor(() => expect(saveButton().disabled).toBe(true));
    expect(box("English").checked).toBe(true);
    expect(box("Finnish").checked).toBe(true);
  });

  it("says so and keeps the draft when the save fails", async () => {
    updateProfile.mockRejectedValueOnce(new Error("nope"));
    renderCard();

    fireEvent.click(box("Finnish"));
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(screen.getByRole("alert").textContent).toContain(
      messages.admin.geduLanguages.error,
    );
    expect(box("Finnish").checked).toBe(false);
    expect(saveButton().disabled).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { resolveGamerPhotoConsents } from "@/services/gamer-photo-consents/resolve-gamer-photo-consents";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import type {
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";
import type { GamerPhotoConsent } from "@/types";

/**
 * ============================================================================
 * Who may be photographed, and on which products the question is asked at all.
 * ============================================================================
 *
 * Two rules, and the second is the one that costs a child their privacy if it
 * ever quietly inverts:
 *
 *   - **Nothing on a product that does not ask.** The session editor's photo
 *     block is byte-for-byte what it always was, with no note and no list.
 *   - **An absent row is a refusal.** A gamer nobody has answered for and a
 *     gamer whose parent said no render identically — the child stays out of
 *     the photograph either way.
 */

/** Real generated UUIDs: ids reaching an identicon must never be readable stubs. */
const AINO = "0d5f9c2b-0a1c-4a2e-9d5c-1f0a5a7e2b31";
const ELIAS = "9a2b1c4d-3e5f-4a6b-8c7d-2e1f0a3b4c5d";
const SIIRI = "3b6c9d0e-7f18-4c2a-9b3d-5e7f1a2b3c4d";

const ROSTER: readonly SessionFeedGamer[] = [
  { id: AINO, firstName: "Aino" },
  { id: ELIAS, firstName: "Elias" },
  { id: SIIRI, firstName: "Siiri" },
];

function row(
  gamerId: string,
  granted: boolean,
  consentType: GamerPhotoConsent["consent_type"] = "lynx_educate",
): GamerPhotoConsent {
  return {
    gamer_id: gamerId,
    consent_type: consentType,
    granted,
    updated_at: "2026-08-14T09:12:00.000Z",
  };
}

describe("resolveGamerPhotoConsents", () => {
  it("allows only a gamer with a granted row for the consent asked", () => {
    const allowed = resolveGamerPhotoConsents(
      [row(AINO, true), row(ELIAS, false)],
      ["lynx_educate"],
    );

    expect(allowed.get(AINO)).toBe(true);
    expect(allowed.get(ELIAS)).toBe(false);
  });

  it("treats a gamer with no row as not allowed", () => {
    const allowed = resolveGamerPhotoConsents([row(AINO, true)], [
      "lynx_educate",
    ]);

    // The feature's central decision: never asked reads exactly as refused, and
    // the caller sees a miss rather than a `true`.
    expect(allowed.get(SIIRI)).toBeUndefined();
    expect(allowed.get(SIIRI) === true).toBe(false);
  });

  it("allows nobody when the product asks for nothing", () => {
    const allowed = resolveGamerPhotoConsents([row(AINO, true)], []);

    expect(allowed.size).toBe(0);
  });
});

/** Monday 16 March 2026, a 90-minute Helsinki club, written up. */
const PAST_ID = "group-1:2026-03-16";
const NOW = new Date("2026-03-17T09:00:00.000Z");

const pastEntry: SessionFeedEntry = {
  kind: "past",
  id: PAST_ID,
  startsAt: new Date("2026-03-16T14:30:00.000Z"),
  endsAt: new Date("2026-03-16T16:00:00.000Z"),
  report: "# Redstone week\n\nWe built item sorters.",
  staffNote: null,
  attendance: {},
  images: [],
  owed: true,
  reportEmailedAt: null,
  lastEditedBy: null,
};

function renderFeed(photoConsents: ReadonlyMap<string, boolean> | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={[pastEntry]}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            // Open, because the block lives inside the editor.
            editingEntryId={PAST_ID}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            onAddPhoto={() => Promise.resolve("stored")}
            onRemovePhoto={() => Promise.resolve()}
            photoConsents={photoConsents}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

const copy = messages.gedu.sessionFeed;

afterEach(cleanup);

describe("the session editor's photo consent block", () => {
  it("is absent on a product that does not ask the consent", () => {
    renderFeed(null);

    expect(screen.queryByText(copy.photoConsentNote)).toBeNull();
    expect(screen.queryByText(copy.photoConsentTitle)).toBeNull();
    // The rest of the photo block is untouched — the editor still offers a
    // photo, which is the half of "byte-for-byte unchanged" worth asserting.
    expect(screen.getByText(copy.addPhoto)).toBeTruthy();
  });

  it("states the verbal ask and marks every roster member", () => {
    renderFeed(
      resolveGamerPhotoConsents(
        [row(AINO, true), row(ELIAS, false)],
        ["lynx_educate"],
      ),
    );

    expect(screen.getByText(copy.photoConsentNote)).toBeTruthy();
    // Every roster member is named. `getAllByText` because the register above
    // names the same people — this list is the second place they appear on an
    // open editor, not the first.
    for (const gamer of ROSTER) {
      expect(screen.getAllByText(gamer.firstName).length).toBeGreaterThan(0);
    }

    // One allowed, and two not: the refusal and the child nobody has answered
    // for are one and the same mark.
    expect(screen.getAllByText(copy.photoConsentAllowed)).toHaveLength(1);
    expect(screen.getAllByText(copy.photoConsentNotAllowed)).toHaveLength(2);
  });
});

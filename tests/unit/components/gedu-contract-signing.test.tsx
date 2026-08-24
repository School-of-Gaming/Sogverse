import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduContractPageBody } from "@/components/gedu/contract/gedu-contract-page-body";
import { getGeduContractDocument, GEDU_CONTRACT_CURRENT_VERSION } from "@/components/gedu/contract/documents";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GeduContractAcceptance } from "@/types";

/**
 * **The signing dialog's close on success is a derivation, and this pins it.**
 *
 * The dialog is mounted while the page body's own `signing` flag is up — but no
 * success handler reaches that flag, because the write lives in the host and
 * the flag lives here. What closes the ceremony is the acceptance row itself
 * arriving through the refetch: the dialog renders only while there is still
 * something to sign (`acceptance === null`), so the row landing is the close.
 * The first shipped version gated on `signing` alone, and the accept spun
 * forever over the record card it had just produced — the dialog had no way to
 * learn the errand was done.
 *
 * Driven in jsdom rather than static markup because the defect *was* a state
 * transition: open the ceremony, then let the acceptance land, and assert the
 * dialog left with it.
 */

const NOW = new Date("2026-08-24T12:00:00Z");

const contract = getGeduContractDocument(GEDU_CONTRACT_CURRENT_VERSION, "fi");
if (contract === undefined) throw new Error("current contract document missing");

const ACCEPTANCE: GeduContractAcceptance = {
  gedu_id: "b3e2f1d0-0000-4000-8000-000000000001",
  contract_version: GEDU_CONTRACT_CURRENT_VERSION,
  accepted_at: "2026-08-24T12:00:05+00:00",
  signed_name: "Aino Virtanen",
};

function pageBody(acceptance: GeduContractAcceptance | null) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <GeduContractPageBody
            contract={contract}
            acceptance={acceptance}
            signerName="Aino Virtanen"
            committing={acceptance === null}
            acceptFailed={false}
            onSignOpen={() => {}}
            onAccept={() => {}}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

describe("the signing ceremony's close", () => {
  it("unmounts the dialog when the acceptance row lands, and the record card offers the way back", () => {
    const { rerender } = render(pageBody(null));

    // Open the ceremony the way a gedu does: through the accept call to action.
    fireEvent.click(
      screen.getByRole("button", { name: messages.gedu.contract.acceptCta }),
    );
    expect(screen.queryByText(messages.gedu.contract.dialog.title)).toBeTruthy();

    // The write succeeded and the refetched row arrives. The committing flag is
    // deliberately still set — success never clears it — so only the row can
    // close the ceremony.
    rerender(pageBody(ACCEPTANCE));

    expect(screen.queryByText(messages.gedu.contract.dialog.title)).toBeNull();
    // The record card stands where the panel was…
    expect(screen.queryByText(messages.gedu.contract.acceptedTitle)).toBeTruthy();
    expect(screen.queryByText(ACCEPTANCE.signed_name)).toBeTruthy();
    // …and carries its own way back to My SOG: the signer is at the foot of a
    // long document, and the errand ends with a door, not a scroll. Two of the
    // same door on purpose — the page's own back link at the top, and the
    // card's at the bottom where the errand actually ended.
    expect(
      screen.queryAllByRole("link", { name: messages.gedu.contract.back }),
    ).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **Filing or withdrawing an absence refetches the gedu's live requests.**
 *
 * The absence picker disables the sessions the gedu has already asked a
 * substitute for by that read. Left cached after a filing, the row just filed
 * would be offered again the moment the picker's own in-visit memory was gone;
 * left cached after a withdrawal, a session the gedu may ask about again would
 * stay disabled.
 *
 * The service is stood in for; what is under test is the invalidation the
 * mutation hooks run on success.
 */
vi.mock("@/lib/supabase/client", () => ({ getClient: () => ({}) }));

vi.mock("@/services/session-substitution/session-substitution.service", () => ({
  SessionSubstitutionService: class {
    requestSubstitution() {
      return Promise.resolve({});
    }
    withdrawRequest() {
      return Promise.resolve({});
    }
    withdrawRequestAsAdmin() {
      return Promise.resolve({});
    }
  },
}));

import { sessionSubstitutionKeys } from "@/services/session-substitution/session-substitution.keys";
import {
  useRequestSessionSubstitution,
  useWithdrawSessionSubstitutionRequest,
  useWithdrawSessionSubstitutionRequestAsAdmin,
} from "@/services/session-substitution/session-substitution.queries";

const GROUP = "5d0c6b1e-2f4a-4e3b-9c8d-7a6f5e4d3c2b";
const REQUEST = "8e7d6c5b-4a39-4281-b0c9-d8e7f6a5b4c3";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(sessionSubstitutionKeys.myLiveRequests(), []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = () =>
    client.getQueryState(sessionSubstitutionKeys.myLiveRequests())?.isInvalidated;
  return { wrapper, stale };
}

describe("the live-requests read after a substitution write", () => {
  it("is marked stale by a filing", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useRequestSessionSubstitution(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        groupId: GROUP,
        sessionDate: "2026-10-19",
        reason: "sick",
      }),
    );

    expect(stale()).toBe(true);
  });

  it("is marked stale by the gedu's own withdrawal", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useWithdrawSessionSubstitutionRequest(), {
      wrapper,
    });

    await act(() => result.current.mutateAsync({ requestId: REQUEST }));

    expect(stale()).toBe(true);
  });

  it("is marked stale by an admin's withdrawal", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(
      () => useWithdrawSessionSubstitutionRequestAsAdmin(),
      { wrapper },
    );

    await act(() => result.current.mutateAsync({ requestId: REQUEST }));

    expect(stale()).toBe(true);
  });
});

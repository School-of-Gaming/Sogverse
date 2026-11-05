import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enFamily from "@/../messages/en/family.json";
import enGamerSignIn from "@/../messages/en/gamerSignIn.json";
import enCommon from "@/../messages/en/common.json";
import { AddGamerDialog } from "@/components/family/AddGamerDialog";
import { asObject } from "../../helpers/json";

/**
 * **A child added is a conversion only from a product's sign-up panel.**
 *
 * The dialog is the one place both callers meet: the family's own dashboard
 * opens it bare, and a product's sign-up panel opens it with the product its
 * page is about. Pinned here: that the bare dialog sends the create nothing a
 * report could be built from, and that the panel's sends the product with a
 * fresh id and hands that same id back only once the child exists — so the
 * panel's push and the route's report are one conversion, and a failed create
 * pushes nothing.
 */

const messages = {
  family: enFamily,
  gamerSignIn: enGamerSignIn,
  common: enCommon,
};

const PARENT_ID = "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f";
const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const mutateAsync = vi.fn();
vi.mock("@/services/gamers/gamers.queries", () => ({
  useCreateGamer: () => ({ mutateAsync }),
}));
vi.mock("@/services/pin/pin.queries", () => ({
  usePinStatus: () => ({ data: { isSet: true, unlocked: true }, isError: false }),
  pinKeys: { status: () => ["pin", "status"] },
}));
vi.mock("@/providers/auth-provider", () => ({
  useRequiredAuth: () => ({ user: { id: PARENT_ID } }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));

function field(id: string) {
  const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (!input) throw new Error(`no field #${id}`);
  return input;
}

/** Fill page one, go to page two, and press the create with its default mode. */
async function addChild(signUp?: React.ComponentProps<typeof AddGamerDialog>["signUp"]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddGamerDialog open onOpenChange={() => {}} signUp={signUp} />
    </NextIntlClientProvider>,
  );
  fireEvent.change(field("add-gamer-first-name"), { target: { value: "Lily" } });
  fireEvent.change(field("add-gamer-month"), { target: { value: "3" } });
  fireEvent.change(field("add-gamer-year"), { target: { value: "2015" } });
  const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error("no declaration checkbox");
  fireEvent.click(box);
  const form = () => {
    const found = document.querySelector("form");
    if (!found) throw new Error("no form");
    return found;
  };
  await act(async () => {
    fireEvent.submit(form());
  });
  await act(async () => {
    fireEvent.submit(form());
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ gamerId: "1a8e1e2a-32f6-4c6f-9a6a-9d0f2a1b7c44" });
});

describe("the family's own dashboard", () => {
  it("creates the child with nothing a conversion could be reported from", async () => {
    await addChild();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const call = asObject(mutateAsync.mock.calls[0][0]);
    expect(call.parentId).toBe(PARENT_ID);
    expect(call.signUp).toBeUndefined();
  });
});

describe("a product's sign-up panel", () => {
  it("sends the product with a fresh id, and hands the same id back once the child exists", async () => {
    const onChildAdded = vi.fn();

    await addChild({ productId: PRODUCT_ID, onChildAdded });

    const signUp = asObject(asObject(mutateAsync.mock.calls[0][0]).signUp);
    expect(signUp.productId).toBe(PRODUCT_ID);
    expect(signUp.eventId).toMatch(UUID);
    expect(onChildAdded).toHaveBeenCalledTimes(1);
    expect(onChildAdded).toHaveBeenCalledWith(signUp.eventId);
  });

  it("hands nothing back when the child was not created", async () => {
    mutateAsync.mockRejectedValue(new Error("network down"));
    const onChildAdded = vi.fn();

    await addChild({ productId: PRODUCT_ID, onChildAdded });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(onChildAdded).not.toHaveBeenCalled();
  });
});

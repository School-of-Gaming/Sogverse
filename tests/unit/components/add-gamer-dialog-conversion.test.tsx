import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enFamily from "@/../messages/en/family.json";
import enGamerSignIn from "@/../messages/en/gamerSignIn.json";
import enCommon from "@/../messages/en/common.json";
import { AddGamerDialog } from "@/components/family/AddGamerDialog";
import { asObject } from "../../helpers/json";

/**
 * **Every child added is a conversion, and every create carries its id.**
 *
 * The dialog is the one place both callers meet: the family's own dashboard
 * opens it bare, and a product's sign-up panel opens it with the product its
 * page is about. Pinned here: that every create sends a fresh event id, with
 * the product only when the caller named one, and that the same id is handed
 * back with the new child only once the child exists — so the panel's push and
 * the route's report are one conversion, and a failed create pushes nothing.
 */

const messages = {
  family: enFamily,
  gamerSignIn: enGamerSignIn,
  common: enCommon,
};

const PARENT_ID = "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f";
const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const GAMER_ID = "1a8e1e2a-32f6-4c6f-9a6a-9d0f2a1b7c44";
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

type DialogProps = Partial<React.ComponentProps<typeof AddGamerDialog>>;

/** Fill page one, go to page two, and press the create with its default mode. */
async function addChild(props: DialogProps = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddGamerDialog open onOpenChange={() => {}} {...props} />
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

/** What the last create sent for the route's child-added report. */
function sentConversion() {
  return asObject(asObject(mutateAsync.mock.calls.at(-1)?.[0]).conversion);
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ gamerId: GAMER_ID });
});

describe("the family's own dashboard", () => {
  it("sends a fresh event id and no product", async () => {
    const onCreated = vi.fn();

    await addChild({ onCreated });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(asObject(mutateAsync.mock.calls[0][0]).parentId).toBe(PARENT_ID);
    const conversion = sentConversion();
    expect(conversion.eventId).toMatch(UUID);
    expect(conversion.productId).toBeUndefined();
    expect(onCreated).toHaveBeenCalledWith(GAMER_ID, conversion.eventId);
  });

  it("mints a new id for every attempt, a retry included", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("network down"));
    await addChild();
    // The failed create leaves the parent on the sign-in page; press it again.
    await act(async () => {
      const form = document.querySelector("form");
      if (!form) throw new Error("no form");
      fireEvent.submit(form);
    });

    expect(mutateAsync).toHaveBeenCalledTimes(2);
    const [first, second] = mutateAsync.mock.calls.map(
      ([call]) => asObject(asObject(call).conversion).eventId,
    );
    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
    expect(first).not.toBe(second);
  });
});

describe("a product's sign-up panel", () => {
  it("sends the product with a fresh id, and hands the same id back with the child", async () => {
    const onCreated = vi.fn();

    await addChild({ productId: PRODUCT_ID, onCreated });

    const conversion = sentConversion();
    expect(conversion.productId).toBe(PRODUCT_ID);
    expect(conversion.eventId).toMatch(UUID);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(GAMER_ID, conversion.eventId);
  });

  it("hands nothing back when the child was not created", async () => {
    mutateAsync.mockRejectedValue(new Error("network down"));
    const onCreated = vi.fn();

    await addChild({ productId: PRODUCT_ID, onCreated });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });
});

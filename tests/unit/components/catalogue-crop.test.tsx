import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * **A picked file goes through the crop step's type gate.**
 *
 * The upload routes take a JPEG of the purpose's exact size and nothing else, and
 * the crop step is what produces one. A file outside the accepted list is
 * refused in the dialog rather than reaching the canvas.
 *
 * jsdom decodes no images and makes no object URLs, so both are stood in for,
 * and the cropper is a stub: what is under test is whether the dialog reaches
 * the crop frame or the "unreadable" message.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => "en",
}));

vi.mock("react-easy-crop", () => ({
  default: () => <div data-testid="cropper" />,
}));

import { useCatalogueCrop } from "@/components/admin/products/catalogue-crop";

function Harness({ file }: { file: File }) {
  const crop = useCatalogueCrop("library_cover", () => {});
  return (
    <>
      <button type="button" onClick={() => crop.crop(file)}>
        pick
      </button>
      {crop.element}
    </>
  );
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:picked",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

describe("useCatalogueCrop", () => {
  it("opens a picked JPEG in the crop frame", async () => {
    render(
      <Harness file={new File(["jpeg"], "cover.jpg", { type: "image/jpeg" })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "pick" }));

    await waitFor(() => expect(screen.getByTestId("cropper")).toBeDefined());
    expect(screen.queryByText("imageCrop.unreadable")).toBeNull();
  });

  it("refuses a picked AVIF file at the type gate", async () => {
    render(
      <Harness file={new File(["avif"], "cover.avif", { type: "image/avif" })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "pick" }));

    await waitFor(() =>
      expect(screen.getByText("imageCrop.unreadable")).toBeDefined(),
    );
    expect(screen.queryByTestId("cropper")).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * **The crop step's lifecycle: only the latest pick lands, and every object
 * URL it makes is revoked.**
 *
 * jsdom makes no object URLs and decodes no images, so both are stood in for:
 * each pick gets a numbered URL, and each decode waits until the case settles
 * it, which is what lets a slow decode be overtaken. The cropper is a stub
 * that shows which URL reached the frame.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => "en",
}));

vi.mock("react-easy-crop", () => ({
  default: ({ image }: { image: string }) => (
    <div data-testid="cropper" data-image={image} />
  ),
}));

import { useImageCrop } from "@/components/ui/use-image-crop";

let made = 0;
const revoked: string[] = [];
/** Each pending decode, by the URL it was started on. */
const decodes = new Map<string, { resolve: () => void; reject: () => void }>();

beforeEach(() => {
  made = 0;
  revoked.length = 0;
  decodes.clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => `blob:${++made}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: (url: string) => revoked.push(url),
  });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value(this: HTMLImageElement) {
      const src = this.getAttribute("src") ?? "";
      return new Promise<void>((resolve, reject) => {
        decodes.set(src, { resolve, reject: () => reject(new Error("bad")) });
      });
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

function jpeg(name: string) {
  return new File(["x"], name, { type: "image/jpeg" });
}

function Harness({ files }: { files: File[] }) {
  const crop = useImageCrop({ width: 800, height: 1000 }, () => {});
  return (
    <>
      {files.map((file) => (
        <button key={file.name} type="button" onClick={() => crop.crop(file)}>
          {file.name}
        </button>
      ))}
      {crop.element}
    </>
  );
}

async function settle(url: string, readable = true) {
  await act(async () => {
    const decode = decodes.get(url);
    if (readable) decode?.resolve();
    else decode?.reject();
  });
}

describe("useImageCrop", () => {
  it("drops a slow decode overtaken by a later pick, and revokes its URL", async () => {
    render(<Harness files={[jpeg("first.jpg"), jpeg("second.jpg")]} />);

    fireEvent.click(screen.getByRole("button", { name: "first.jpg", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "second.jpg", hidden: true }));
    expect(revoked).toEqual(["blob:1"]);

    await settle("blob:2");
    expect(screen.getByTestId("cropper").dataset.image).toBe("blob:2");

    // The first file's decode lands late, and lands nowhere.
    await settle("blob:1");
    expect(screen.getByTestId("cropper").dataset.image).toBe("blob:2");
  });

  it("drops a decode that lands after the dialog was cancelled", async () => {
    render(<Harness files={[jpeg("photo.jpg")]} />);

    fireEvent.click(screen.getByRole("button", { name: "photo.jpg", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(revoked).toEqual(["blob:1"]);

    await settle("blob:1");
    expect(screen.queryByTestId("cropper")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("revokes the URL of a file that turns out unreadable, and of one cancelled", async () => {
    render(<Harness files={[jpeg("broken.jpg"), jpeg("good.jpg")]} />);

    fireEvent.click(screen.getByRole("button", { name: "broken.jpg", hidden: true }));
    await settle("blob:1", false);
    screen.getByText("imageCrop.unreadable");
    expect(revoked).toEqual(["blob:1"]);

    fireEvent.click(screen.getByRole("button", { name: "good.jpg", hidden: true }));
    await settle("blob:2");
    expect(screen.getByTestId("cropper").dataset.image).toBe("blob:2");
    expect(revoked).toEqual(["blob:1"]);

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(revoked).toEqual(["blob:1", "blob:2"]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  IMAGE_CROP_ACCEPT,
  ImageCropDialog,
  decodeImageForCrop,
} from "@/components/ui/image-crop-dialog";

/**
 * The shared crop step: the output is drawn at exactly the size the caller
 * asks for, and the frame's aspect ratio is that size's, so a 3:2 product
 * image, a 16:9 cover and a 4:5 team photo all come out as asked.
 *
 * jsdom has no canvas and decodes no images, so both are stood in for: the
 * canvas's context records what was drawn, and the cropper is replaced by a
 * stub that reports its aspect and a framed area at once.
 */

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return t;
  },
  useLocale: () => "en",
}));

const FRAMED = { x: 10, y: 20, width: 300, height: 200 };

vi.mock("react-easy-crop", async () => {
  const { useEffect } = await import("react");
  function Cropper({
    aspect,
    onCropComplete,
  }: {
    aspect: number;
    onCropComplete: (area: unknown, pixels: typeof FRAMED) => void;
  }) {
    useEffect(() => {
      onCropComplete(FRAMED, FRAMED);
    }, [onCropComplete]);
    return <div data-testid="cropper" data-aspect={aspect} />;
  }
  return { default: Cropper };
});

interface Drawn {
  width: number;
  height: number;
  drawImage: ReturnType<typeof vi.fn>;
}

let drawn: Drawn[] = [];
/** jsdom's images have no `decode`; this one always succeeds. */
const decode = vi.fn(() => Promise.resolve());

beforeEach(() => {
  drawn = [];
  decode.mockClear();
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  // jsdom's canvas draws nothing, so it is replaced by one that records the
  // size it was drawn at and what was drawn onto it.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value(this: HTMLCanvasElement) {
      const record: Drawn = {
        width: this.width,
        height: this.height,
        drawImage: vi.fn(),
      };
      drawn.push(record);
      return { imageSmoothingQuality: "low", drawImage: record.drawImage };
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value(callback: BlobCallback, type?: string) {
      callback(new Blob(["x"], { type }));
    },
  });
});

const realGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);
const realToBlob = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "toBlob",
);

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  if (realGetContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  }
  if (realToBlob) {
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", realToBlob);
  }
});

async function cropAt(width: number, height: number) {
  const onConfirm = vi.fn<(cropped: Blob) => void>();
  render(
    <ImageCropDialog
      source={{ kind: "ready", url: "blob:picked" }}
      outputWidth={width}
      outputHeight={height}
      onCancel={vi.fn()}
      onChooseAnother={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  const aspect = Number(screen.getByTestId("cropper").dataset.aspect);
  const confirm = screen.getByRole<HTMLButtonElement>("button", {
    name: "imageCrop.confirm",
  });
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  return { aspect, blob: onConfirm.mock.calls[0][0] };
}

describe("ImageCropDialog output size", () => {
  it.each([
    ["4:5 team photo", 800, 1000],
    ["3:2 product image", 1200, 800],
    ["16:9 cover", 1600, 900],
  ])("draws a %s at the size the props ask for", async (_, width, height) => {
    const { aspect, blob } = await cropAt(width, height);

    expect(aspect).toBeCloseTo(width / height);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].width).toBe(width);
    expect(drawn[0].height).toBe(height);
    expect(drawn[0].drawImage).toHaveBeenCalledWith(
      expect.anything(),
      FRAMED.x,
      FRAMED.y,
      FRAMED.width,
      FRAMED.height,
      0,
      0,
      width,
      height,
    );
    expect(blob.type).toBe("image/jpeg");
  });
});

describe("ImageCropDialog copy", () => {
  it("takes the caller's title and confirm label beside the neutral copy", () => {
    render(
      <ImageCropDialog
        source={{ kind: "decoding", url: "blob:picked" }}
        outputWidth={800}
        outputHeight={1000}
        title="Crop your photo"
        confirmLabel="Use photo"
        onCancel={vi.fn()}
        onChooseAnother={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    screen.getByText("Crop your photo");
    screen.getByText("imageCrop.description");
    // Settled before decode: the confirm button is there, waiting disabled.
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Use photo" }).disabled,
    ).toBe(true);
  });
});

describe("decodeImageForCrop", () => {
  it("refuses a type outside the accepted list without decoding", async () => {
    expect(IMAGE_CROP_ACCEPT).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(await decodeImageForCrop("blob:picked", "image/heic")).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    expect(await decodeImageForCrop("blob:picked", "image/png")).toBe(true);
  });
});

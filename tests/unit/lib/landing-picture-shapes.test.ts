import { describe, expect, it } from "vitest";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { landingPictureDestination } from "@/lib/landing-pages/picture-destination";
import {
  LANDING_PICTURE_PURPOSES,
  LANDING_PICTURE_SHAPES,
  describeLandingPictureShape,
  describeLandingPictureShapes,
  isLandingPicturePurpose,
  landingPictureShapeOf,
  type LandingPictureShape,
} from "@/lib/landing-pages/picture-shapes";
import { LANDING_SECTIONS, type LandingSection } from "@/lib/landing-pages/sections";

/*
 * The landing picture shapes: each a catalogue purpose whose stored size is
 * its shape, and the shapes a picture placed in a section may be.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("the landing picture shapes", () => {
  it("are each a catalogue purpose, stored at the shape's ratio", () => {
    expect(LANDING_PICTURE_SHAPES.map(describeLandingPictureShape)).toEqual([
      "wide 16:9",
      "square 1:1",
      "portrait 4:5",
    ]);
    for (const shape of LANDING_PICTURE_SHAPES) {
      const purpose = LANDING_PICTURE_PURPOSES[shape];
      expect(Object.hasOwn(CATALOGUE_IMAGE_PURPOSES, purpose)).toBe(true);
      expect(landingPictureShapeOf(purpose)).toBe(shape);
    }
    expect(CATALOGUE_IMAGE_PURPOSES.landing_square_image).toMatchObject({ width: 1200, height: 1200 });
    expect(CATALOGUE_IMAGE_PURPOSES.landing_portrait_image).toMatchObject({ width: 1200, height: 1500 });
  });

  it("tells a landing purpose from every other catalogue purpose", () => {
    expect(Object.keys(CATALOGUE_IMAGE_PURPOSES).filter(isLandingPicturePurpose).sort()).toEqual(
      ["landing_image", "landing_portrait_image", "landing_square_image"],
    );
  });

  it("lists shapes as one alternative", () => {
    expect(describeLandingPictureShapes(["wide"])).toBe("wide 16:9");
    expect(describeLandingPictureShapes(LANDING_PICTURE_SHAPES)).toBe(
      "wide 16:9, square 1:1 or portrait 4:5",
    );
  });

  it("takes wide alone in a hero, which is the page's link preview, and every shape elsewhere", () => {
    expect(LANDING_SECTIONS.hero.pictureShapes).toEqual(["wide"]);
    expect(LANDING_SECTIONS.text.pictureShapes).toEqual(LANDING_PICTURE_SHAPES);
    expect(LANDING_SECTIONS.image.pictureShapes).toEqual(LANDING_PICTURE_SHAPES);
  });
});

describe("landingPictureDestination", () => {
  const shapes: Record<string, LandingPictureShape> = { [id(50)]: "square", [id(51)]: "portrait" };
  const shapeOf = (imageId: string) => (Object.hasOwn(shapes, imageId) ? shapes[imageId] : null);

  it("narrows a hero to wide, saying why", () => {
    const hero: LandingSection = { id: id(1), type: "hero" };
    expect(landingPictureDestination(hero, undefined, shapeOf)).toEqual({
      shapes: ["wide"],
      rule: "A hero section's picture must be wide 16:9.",
    });
  });

  it("takes every shape in a text section, and in an image section with no other picture", () => {
    const text: LandingSection = { id: id(2), type: "text", imageSide: "start", imageId: id(50) };
    const lone: LandingSection = { id: id(3), type: "image", images: [{ id: id(10), imageId: id(50) }] };
    for (const [section, pictureId] of [
      [text, undefined],
      [lone, id(10)],
    ] as const) {
      expect(landingPictureDestination(section, pictureId, shapeOf)).toEqual({
        shapes: LANDING_PICTURE_SHAPES,
        rule: null,
      });
    }
  });

  it("narrows an image section to its other pictures' shape", () => {
    const gallery: LandingSection = {
      id: id(3),
      type: "image",
      images: [
        { id: id(10), imageId: id(50) },
        { id: id(11), imageId: id(50) },
      ],
    };
    const rule =
      "The other pictures of this image section are square 1:1, and an image section's pictures must all be one shape.";
    expect(landingPictureDestination(gallery, undefined, shapeOf)).toEqual({ shapes: ["square"], rule });
    expect(landingPictureDestination(gallery, id(10), shapeOf)).toEqual({ shapes: ["square"], rule });
  });
});

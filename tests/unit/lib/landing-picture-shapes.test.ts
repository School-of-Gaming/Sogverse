import { describe, expect, it } from "vitest";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import {
  LANDING_PICTURE_PURPOSES,
  LANDING_PICTURE_SHAPES,
  describeLandingPictureShape,
  describeLandingPictureShapes,
  isLandingPicturePurpose,
  landingPictureShapeOf,
} from "@/lib/landing-pages/picture-shapes";
import { LANDING_SECTIONS } from "@/lib/landing-pages/sections";

/*
 * The landing picture shapes: each a catalogue purpose whose stored size is
 * its shape, and the shapes each section type takes.
 */

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

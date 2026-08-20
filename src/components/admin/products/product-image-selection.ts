/**
 * The catalogue entry a product is pointing at, as far as the product form is
 * concerned: enough to paint it and to name it, and nothing else.
 *
 * It is **derived, never form state**. Form state carries `imageId` alone. The
 * edit page seeds the label and the path from the admin product read's
 * `product_images` embed; from then on, whatever surface changes the pick hands
 * back the entry it changed to, so a rename or a replace made inside the
 * catalogue dialog can never leave a stale label on the card.
 */
export interface ProductImageSelection {
  label: string;
  path: string;
}

/**
 * The same thing with its id — what the catalogue dialog hands back, because a
 * pick is an id *and* a picture and the two must arrive together or the card
 * paints one entry while the form saves another.
 */
export interface ProductImageEntry extends ProductImageSelection {
  id: string;
}

import type { ProductImageUsage, ProductImageUser } from "@/services/product-images";
import type { ProductImage } from "@/types";

/**
 * Fixtures for the catalogue's style-guide section: four entries, one of them
 * shared by 22 products, so both ends of the reach scale can be seen without a
 * database.
 *
 * **The ids are real generated UUIDs, hardcoded**, and the paths are the
 * repository's own preview art — root-relative, which the product image
 * resolver passes straight through, so a demo tile paints a real picture
 * through the real frame with no network and no bucket.
 */

const IMAGE_IDS = {
  terrain: "78766316-c020-4b02-b5d7-2217b07777d4",
  racetrack: "41ff86bb-9d78-4496-ba63-b4120a74f480",
  park: "bd9361f2-f655-417b-8e37-3a6481db59d3",
  interior: "600518b6-dd27-4d74-b2f0-317d07a0f6d8",
} as const;

export const CATALOGUE_DEMO_IMAGES: ProductImage[] = [
  {
    id: IMAGE_IDS.interior,
    label: "Minecraft build hall",
    sha256: "9b1a6f0c4d2e8a7b5c3f1e0d9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
    path: "/preview-art/card-interior.svg",
    created_at: "2026-08-18T09:12:00.000Z",
  },
  {
    id: IMAGE_IDS.park,
    label: "Roblox park",
    sha256: "1f2e3d4c5b6a798877665544332211ffeeddccbbaa99887766554433221100ff",
    path: "/preview-art/card-park.svg",
    created_at: "2026-08-14T15:40:00.000Z",
  },
  {
    id: IMAGE_IDS.racetrack,
    label: "Racetrack",
    sha256: "aa11bb22cc33dd44ee55ff6677889900aabbccddeeff112233445566778899aa",
    path: "/preview-art/card-racetrack.svg",
    created_at: "2026-07-30T11:05:00.000Z",
  },
  {
    id: IMAGE_IDS.terrain,
    label: "Survival terrain",
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    path: "/preview-art/card-terrain.svg",
    created_at: "2026-06-02T08:00:00.000Z",
  },
];

/**
 * The 22 products the terrain picture reaches — the number the confirm dialogs
 * were designed against, because a count-bearing button that scrolls off the
 * screen at 22 is the failure the pinned footer exists to prevent.
 */
const SHARED_PRODUCT_IDS = [
  "f35f89a4-fdbc-4fee-8910-c96980593446",
  "64a9888f-2c2c-412e-9722-40b1ee94b032",
  "e6a40d8b-31d1-43fc-aaf3-b5e619111b8a",
  "89865896-242c-490c-9fb2-6b8d134c3463",
  "65ea658a-ede4-42f9-b783-96bd2cc48fee",
  "31b51775-7f36-4e30-8ec3-224182908459",
  "34a9bcb5-674c-4baf-940f-c1d6b9510358",
  "30cc3a36-a123-4143-92d5-20a82d9ece0e",
  "d2af3383-7246-4f21-911c-0ac0e0c02478",
  "770d6b07-3c20-4c18-b1fe-fe4dd4df5f2f",
  "d8ac48c1-90e9-4de0-b3f0-39b800b19fc4",
  "a7296e44-e589-460b-b837-b3b36ac25caf",
  "31b42af1-e237-43e6-9375-95cf54f47b6a",
  "546969a0-3954-4316-aff1-0a7fac392150",
  "835e5bca-9b40-4957-a23a-c033ed3908c3",
  "4aeebe5a-6ef7-4632-a2c4-bf2dde3043c3",
  "9df65fbc-4b99-4960-8de3-6b14f9d25591",
  "948b6fc8-b34d-41ab-9b43-cd342a775b34",
  "3cf736c4-2ba9-426d-b08d-2383ef516597",
  "ba17e472-4d3a-4da1-9550-16a7a1ef280b",
  "a41df3ab-2b8b-4834-9849-e15ff49c3395",
  "28e58aa9-cf68-4ddd-aa13-92eb637eee82",
] as const;

const SHARED_PRODUCT_NAMES = [
  "Minecraft Club Helsinki — Monday",
  "Minecraft Club Helsinki — Wednesday",
  "Minecraft Club Espoo — Tuesday",
  "Minecraft Club Espoo — Thursday",
  "Minecraft Club Vantaa — Monday",
  "Minecraft Club Tampere — Tuesday",
  "Minecraft Club Turku — Wednesday",
  "Minecraft Club Oulu — Thursday",
  "Minecraft Club Jyväskylä — Friday",
  "Minecraft Club Lahti — Monday",
  "Minecraft Club Kuopio — Tuesday",
  "Minecraft Club Pori — Wednesday",
  "Minecraft Club Joensuu — Thursday",
  "Survival Camp — Autumn break",
  "Survival Camp — Winter break",
  "Survival Camp — Spring break",
  "Survival Camp — Midsummer",
  "Build Night — September",
  "Build Night — October",
  "Build Night — November",
  "Parents' Minecraft Evening",
  "Survival Club — Saturday mornings",
];

const SHARED_PRODUCTS: ProductImageUser[] = SHARED_PRODUCT_IDS.map(
  (id, index) => ({
    id,
    name: SHARED_PRODUCT_NAMES[index],
    product_type: index < 13 ? "consumer_club" : index < 17 ? "camp" : "event",
    // A handful still unpublished, so the live/hidden signal has both states
    // to show — the whole point of carrying it in the list.
    is_visible: index % 7 !== 3,
  }),
);

export const CATALOGUE_DEMO_USAGE: ProductImageUsage = {
  [IMAGE_IDS.terrain]: SHARED_PRODUCTS,
  [IMAGE_IDS.park]: [
    {
      id: "db413bc7-bd3e-4603-9333-144f70879679",
      name: "Roblox Club Helsinki — Monday",
      product_type: "consumer_club",
      is_visible: true,
    },
    {
      id: "cd8878af-43d4-4635-8b0e-3fa33b3484c7",
      name: "Roblox Taster Event",
      product_type: "event",
      is_visible: false,
    },
  ],
  // `interior` and `racetrack` are deliberately absent: an entry nothing uses
  // is missing from the record rather than present with an empty array, and
  // the badge slot has to stay empty for those tiles.
};

/** The entry the 22-product confirm demos are about. */
export const CATALOGUE_DEMO_SHARED_IMAGE_ID: string = IMAGE_IDS.terrain;

/** An entry no product uses — the N = 0 confirm. */
export const CATALOGUE_DEMO_UNUSED_IMAGE_ID: string = IMAGE_IDS.interior;

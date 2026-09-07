"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { ProductGamerPhotoConsentsService } from "./product-gamer-photo-consents.service";

/**
 * Keyed by product, under a root of its own rather than under the gamers'.
 *
 * The two roots answer two different questions — what a product asks, and what
 * a child's parent said — and they are invalidated by two different writes: an
 * admin editing a product's ask set, and a parent answering. Sharing a root
 * would make each write refresh the other's cache for nothing.
 */
export const productGamerPhotoConsentKeys = {
  all: ["product-gamer-photo-consents"] as const,
  forProduct: (productId: string) =>
    [...productGamerPhotoConsentKeys.all, productId] as const,
};

/**
 * Which photo consents a product asks for.
 *
 * A small, indexed, bounded read: it lands in a frame or two, so a consumer
 * renders nothing while it flies rather than a skeleton. What it decides is
 * whether a *staff* surface carries the photo-consent block at all, and the two
 * page shells that ask it do so **at page level, in the same render as the
 * roster** — so the answer is settled long before anybody opens a session
 * editor, and the block is never inserted into a card somebody is already
 * looking at.
 *
 * `undefined` while it is in flight, which every consumer reads as "asks
 * nothing yet" — the same rendering an ordinary product gets, and the safe half
 * of the pair: a block that arrives a frame late costs nothing, where a block
 * that flashed on every product would be teaching staff to ignore it.
 */
export function useProductGamerPhotoConsentTypes(productId: string) {
  const supabase = getClient();
  const service = new ProductGamerPhotoConsentsService(supabase);

  return useQuery({
    queryKey: productGamerPhotoConsentKeys.forProduct(productId),
    queryFn: () => service.getForProduct(productId),
    enabled: !!productId,
  });
}

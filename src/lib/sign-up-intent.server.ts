import "server-only";
import { z } from "zod";
import { signUpTargetFrom } from "@/lib/sign-up-target";
import { createAnonClient } from "@/lib/supabase/anon";

const uuid = z.string().uuid();

/** The intent a profile stores: what the parent was trying to reach, by its meaning. */
export interface SignUpIntent {
  kind: "product" | "municipality_club" | "landing_page";
  id: string;
}

/**
 * What a sign-up set out to reach — a product, a municipality club or a live
 * landing page — or `null`.
 *
 * **Decided by the row, never by the URL.** Read with the anon client, so only
 * a row the public site would show anyone can be named, and a product's kind is
 * its own type: a municipality club reached through a bare shop link is still a
 * municipality club. What is stored is the kind and the id; the URL never is.
 *
 * **It never throws.** No redirect, another page, an unknown or hidden row and
 * a failed read all answer `null`, and the registration goes on without one.
 *
 * Not gated on the marketing cookie the way the UTM values are: it says which
 * of our own pages the parent was trying to reach, which is first-party.
 */
export async function resolveSignUpIntent(
  redirect: string | undefined,
): Promise<SignUpIntent | null> {
  try {
    const target = signUpTargetFrom(redirect);
    if (!target) return null;
    const anon = createAnonClient();

    if (target.kind === "product_page") {
      const { data, error } = await anon
        .from("products")
        .select("id, product_type")
        .eq("id", target.productId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        kind: data.product_type === "municipality_club" ? "municipality_club" : "product",
        id: data.id,
      };
    }

    // An id address resolves in every locale; a slug only in its own.
    if (uuid.safeParse(target.idOrSlug).success) {
      const { data, error } = await anon
        .from("landing_page_publications")
        .select("page_id")
        .eq("page_id", target.idOrSlug)
        .maybeSingle();
      if (error) throw error;
      return data ? { kind: "landing_page", id: data.page_id } : null;
    }

    const { data, error } = await anon
      .from("landing_page_publication_translations")
      .select("page_id")
      // exact-locale: a slug resolves only in its own locale
      .eq("locale", target.locale)
      .eq("slug", target.idOrSlug)
      .maybeSingle();
    if (error) throw error;
    return data ? { kind: "landing_page", id: data.page_id } : null;
  } catch (error) {
    console.error("[sign-up-intent] could not resolve the sign-up intent", error);
    return null;
  }
}

/**
 * The intent as the two profile columns that hold it — both, or neither. The
 * register route hands these keys to `handle_new_user` as signup metadata; the
 * Google finish route writes them as columns.
 */
export function signUpIntentColumns(
  intent: SignUpIntent | null,
): { signup_intent_kind: SignUpIntent["kind"]; signup_intent_id: string } | Record<string, never> {
  return intent ? { signup_intent_kind: intent.kind, signup_intent_id: intent.id } : {};
}

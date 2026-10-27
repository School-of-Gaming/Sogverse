import "server-only";
import { z } from "zod";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * What a sign-up set out to reach, read off the `?redirect=` the register page
 * was opened with and carried in the registration body.
 *
 * **The value is untrusted.** Our own forms carry it, so a client can send
 * anything. It is resolved through `resolveInternalPath()` and matched on its
 * locale-stripped, untranslated pathname (`/fi/kauppa/<id>` is `/shop/<id>`),
 * and an id must be a UUID before anything is read with it.
 */

// Any absolute base splits a path from its query; the value has already been
// proved same-origin by the time it is parsed against this.
const SENTINEL = "https://internal.invalid";

const SHOP_PRODUCT_TEMPLATE = "/shop/[id]";
const SCHOOL_PRODUCT_TEMPLATE = "/schools/[municipalityName]/[id]";
const LANDING_PAGE_TEMPLATE = ROUTES.landingPage("").pathname;

const uuid = z.string().uuid();

/** The page a redirect names, by its shape alone — nothing has been read yet. */
export type SignUpTarget =
  /** A product page, from the shop or from a municipality's school listing. */
  | { kind: "product_page"; via: "shop" | "schools"; productId: string }
  /** A landing page, at its id or at the slug its version in `locale` stores. */
  | { kind: "landing_page"; locale: string; idOrSlug: string };

/** The page a redirect names, or `null` when it is none of the sign-up targets. */
export function signUpTargetFrom(redirect: string | undefined): SignUpTarget | null {
  const path = resolveInternalPath(redirect, "");
  if (!path) return null;

  const { locale, pathname, template } = normalizeExternalPath(
    new URL(path, SENTINEL).pathname,
  );
  const segments = pathname.split("/");

  if (template === SHOP_PRODUCT_TEMPLATE) {
    const id = segments[2];
    return uuid.safeParse(id).success ? { kind: "product_page", via: "shop", productId: id } : null;
  }
  if (template === SCHOOL_PRODUCT_TEMPLATE) {
    const id = segments[3];
    return uuid.safeParse(id).success
      ? { kind: "product_page", via: "schools", productId: id }
      : null;
  }
  if (template === LANDING_PAGE_TEMPLATE) {
    const idOrSlug = segments[2];
    return idOrSlug
      ? { kind: "landing_page", locale: locale ?? DEFAULT_LOCALE, idOrSlug }
      : null;
  }
  return null;
}

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

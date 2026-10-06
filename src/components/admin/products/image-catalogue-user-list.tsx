"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  LibraryArticleImageUser,
  CatalogueImageUser,
  LandingPageImageUser,
  ProductPictureUser,
} from "@/services/catalogue-images";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import { ROUTES } from "@/lib/constants";

/**
 * **Which products, Library articles and landing pages a catalogue entry reaches**, in the
 * one shape both places that ask the question use: the reference column, where
 * it is information, and the confirm dialogs, where it is the thing the admin
 * is being asked to weigh. One component so the two cannot drift into showing
 * different facts about the same entry.
 *
 * A product row is a link to the product's own admin page, because "which
 * products" is rarely the end of the question — the next one is "and what are
 * they". It carries the product's type and whether it is live in the shop, the
 * two facts that decide how much a picture change matters: a hidden draft and
 * a club families are looking at right now are not the same stake.
 *
 * An article row is a link to the article's admin editor, names it by its
 * working title, and says whether this picture is the cover readers see now
 * (live) or only the draft's.
 *
 * A landing page row says the same about the page, by its working title, and
 * is a link to the page's admin editor.
 *
 * The list is **bounded and scrolls**, in both hosts. An entry can reach 22
 * products, and a list that simply grows pushes whatever is under it — the
 * column's own buttons, or the confirm's count-bearing footer — off the screen.
 */
export function CatalogueImageUserList({
  users,
  className,
}: {
  users: readonly CatalogueImageUser[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border",
        className,
      )}
    >
      {users.map((user) => (
        <li key={`${user.kind}:${user.id}`}>
          <UserRow user={user} />
        </li>
      ))}
    </ul>
  );
}

const ROW = "flex items-center justify-between gap-3 px-3 py-2 text-sm";

function UserRow({ user }: { user: CatalogueImageUser }) {
  switch (user.kind) {
    case "product":
      return <ProductRow product={user} />;
    case "library-article":
      return <ArticleRow article={user} />;
    case "landing-page":
      return <LandingPageRow page={user} />;
  }
}

function ProductRow({ product }: { product: ProductPictureUser }) {
  const t = useTranslations("admin.products");
  const config = PRODUCT_TYPE_CONFIG[product.product_type];
  return (
    <Link
      href={ROUTES.admin.product(product.product_type, product.id)}
      className={cn(ROW, "hover:bg-hover")}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {product.name || t("list.untitled")}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {t(`types.${config.i18nKey}.label`)}
        </span>
      </span>
      <LiveMark
        live={product.is_visible}
        label={
          product.is_visible
            ? t("imageCatalogue.live")
            : t("imageCatalogue.hidden")
        }
      />
    </Link>
  );
}

function ArticleRow({ article }: { article: LibraryArticleImageUser }) {
  const t = useTranslations("admin.products.imageCatalogue");
  return (
    <Link
      href={ROUTES.admin.libraryArticle(article.id)}
      className={cn(ROW, "hover:bg-hover")}
    >
      <span className="block min-w-0 truncate font-medium">{article.title}</span>
      <LiveMark
        live={article.is_live}
        label={article.is_live ? t("live") : t("draft")}
      />
    </Link>
  );
}

function LandingPageRow({ page }: { page: LandingPageImageUser }) {
  const t = useTranslations("admin.products.imageCatalogue");
  return (
    <Link
      href={ROUTES.admin.landingPage(page.id)}
      className={cn(ROW, "hover:bg-hover")}
    >
      <span className="block min-w-0 truncate font-medium">{page.title}</span>
      <LiveMark
        live={page.is_live}
        label={page.is_live ? t("live") : t("draft")}
      />
    </Link>
  );
}

function LiveMark({ live, label }: { live: boolean; label: string }) {
  const Icon = live ? CircleDot : Circle;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        live ? "text-success" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";

// Camps are listed with every other product type, narrowed by type. The old
// URL's own query travels with it.
export default async function CampsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect({
    href: ROUTES.admin.productList("camp", await searchParams),
    locale: await getLocale(),
  });
}

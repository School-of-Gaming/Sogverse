import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

// Municipality clubs are listed with every other product type, narrowed by
// type. The old URL's own query travels with it.
export default async function MunicipalityClubsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect({
    href: ROUTES.admin.productList("municipality_club", await searchParams),
    locale: await getLocale(),
  });
}

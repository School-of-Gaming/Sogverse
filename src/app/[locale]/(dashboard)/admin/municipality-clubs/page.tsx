import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

// Municipality clubs are listed with every other product type, narrowed by type.
export default async function MunicipalityClubsPage() {
  redirect({
    href: ROUTES.admin.productList("municipality_club"),
    locale: await getLocale(),
  });
}

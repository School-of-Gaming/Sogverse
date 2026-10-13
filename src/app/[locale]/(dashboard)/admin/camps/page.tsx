import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

// Camps are listed with every other product type, narrowed by type.
export default async function CampsPage() {
  redirect({
    href: ROUTES.admin.productList("camp"),
    locale: await getLocale(),
  });
}

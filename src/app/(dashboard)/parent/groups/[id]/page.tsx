"use client";

import { use } from "react";
import { redirect } from "next/navigation";
import { CustomerGroupDetailContent } from "@/components/customer/CustomerGroupDetailContent";
import { ROUTES } from "@/lib/constants";

export default function CustomerGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gamer?: string }>;
}) {
  const { id } = use(params);
  const { gamer } = use(searchParams);
  if (!gamer) redirect(ROUTES.customer.gamers);
  return <CustomerGroupDetailContent groupId={id} gamerId={gamer} />;
}

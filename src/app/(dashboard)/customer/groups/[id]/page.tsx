"use client";

import { use } from "react";
import { CustomerGroupDetailContent } from "@/components/customer/CustomerGroupDetailContent";

export default function CustomerGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CustomerGroupDetailContent groupId={id} />;
}

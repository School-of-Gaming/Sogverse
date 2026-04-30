"use client";

import { useParams } from "next/navigation";
import { ProductDetailPage } from "@/components/public/products-v2/product-detail-page";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProductDetailPage productId={params.id} productType="event" />;
}

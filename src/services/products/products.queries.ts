"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { ProductsService } from "./products.service";
import type { ProductInsert, ProductUpdate } from "@/types";

const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters: string) => [...productKeys.lists(), { filters }] as const,
  visible: () => [...productKeys.all, "visible"] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};

export function useVisibleProducts() {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.visible(),
    queryFn: () => service.getVisibleProducts(),
  });
}

export function useAllProducts() {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.lists(),
    queryFn: () => service.getAllProducts(),
  });
}

export function useProduct(id: string) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => service.getProduct(id),
    enabled: !!id,
  });
}

export function useSearchProducts(query: string) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.list(query),
    queryFn: () => service.searchProducts(query),
    enabled: query.length >= 2,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: (product: Omit<ProductInsert, "created_by">) => service.createProduct(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.visible() });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ProductUpdate }) =>
      service.updateProduct(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.visible() });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: (id: string) => service.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.visible() });
    },
  });
}

export function useToggleProductVisibility() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      service.toggleProductVisibility(id, isVisible),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.visible() });
    },
  });
}

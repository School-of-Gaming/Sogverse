"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { ProductsService } from "./products.service";
import type { ProductInsert, ProductUpdate } from "@/types";

const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters: string) => [...productKeys.lists(), { filters }] as const,
  active: () => [...productKeys.all, "active"] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  category: (category: string) => [...productKeys.all, "category", category] as const,
};

export function useActiveProducts() {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.active(),
    queryFn: () => service.getActiveProducts(),
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

export function useProductsByCategory(category: string) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.category(category),
    queryFn: () => service.getProductsByCategory(category),
    enabled: !!category,
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
    mutationFn: (product: ProductInsert) => service.createProduct(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.active() });
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
      queryClient.invalidateQueries({ queryKey: productKeys.active() });
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
      queryClient.invalidateQueries({ queryKey: productKeys.active() });
    },
  });
}

export function useToggleProductStatus() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      service.toggleProductStatus(id, isActive),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.active() });
    },
  });
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProductsService } from "@/services/products/products.service";
import type { Database } from "@/types/database.types";
import {
  createMockProduct,
  mockSupabaseSuccess,
  mockSupabaseError,
} from "../../mocks/supabase";

describe("ProductsService", () => {
  let service: ProductsService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  function createMockSupabase() {
    return {
      from: vi.fn(),
      rpc: vi.fn(),
      storage: {
        from: vi.fn(),
      },
    };
  }

  function mockStorageRemove() {
    const remove = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase.storage.from.mockReturnValue({ remove });
    return remove;
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new ProductsService(mockSupabase as unknown as SupabaseClient<Database>);
  });

  describe("getVisibleProducts", () => {
    it("returns visible products via direct query", async () => {
      const mockProducts = [
        createMockProduct({ id: "1", name: "Product 1" }),
        createMockProduct({ id: "2", name: "Product 2" }),
      ];

      const mockOrder = vi.fn().mockResolvedValue(mockSupabaseSuccess(mockProducts));
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const result = await service.getVisibleProducts();

      expect(mockSupabase.from).toHaveBeenCalledWith("products");
      expect(mockSelect).toHaveBeenCalledWith("*, games(name)");
      expect(result).toEqual(mockProducts);
    });

    it("returns empty array when no products", async () => {
      const mockOrder = vi.fn().mockResolvedValue(mockSupabaseSuccess([]));
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const result = await service.getVisibleProducts();

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      const mockOrder = vi.fn().mockResolvedValue(mockSupabaseError("Database error"));
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      await expect(service.getVisibleProducts()).rejects.toThrow();
    });
  });

  describe("getProduct", () => {
    it("returns single product by id", async () => {
      const mockProduct = createMockProduct();

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess(mockProduct)),
        }),
      });

      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const result = await service.getProduct("test-id");

      expect(mockSupabase.from).toHaveBeenCalledWith("products");
      expect(result).toEqual(mockProduct);
    });
  });

  describe("createProduct", () => {
    it("creates a new product", async () => {
      const newProduct = {
        name: "New Product",
        description: "A new product",
        token_cost: 3,
        image_path: "new.jpg",
        game_id: "00000000-0000-0000-0000-000000000001",
        day_of_week: 0,
        start_time: "16:00",
        duration_minutes: 60,
        min_age: 7,
        max_age: 12,
        is_remote: true,
        location_id: null,
        spoken_language_code: "en",
      };
      const createdProduct = createMockProduct(newProduct);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ product: createdProduct }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await service.createProduct(newProduct);

      expect(fetchSpy).toHaveBeenCalledWith("/api/admin/create-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProduct),
      });
      expect(result.name).toBe("New Product");

      fetchSpy.mockRestore();
    });
  });

  describe("updateProduct", () => {
    function mockUpdateChain(updatedProduct: unknown, previousImagePath: string | null) {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(updatedProduct)),
          }),
        }),
      });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            mockSupabaseSuccess({ image_path: previousImagePath }),
          ),
        }),
      });
      // updateProduct calls from("products") twice when image_path is in the
      // updates: once to fetch the previous path, once for the update itself.
      mockSupabase.from
        .mockReturnValueOnce({ select: mockSelect })
        .mockReturnValueOnce({ update: mockUpdate });
      return { mockUpdate, mockSelect };
    }

    it("updates an existing product without touching storage when image_path is not in updates", async () => {
      const updates = { name: "Updated Name" };
      const updatedProduct = createMockProduct(updates);

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(updatedProduct)),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ update: mockUpdate });
      const storageRemove = mockStorageRemove();

      const result = await service.updateProduct("test-id", updates);

      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(result.name).toBe("Updated Name");
      expect(storageRemove).not.toHaveBeenCalled();
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    });

    it("removes the previous image when image_path changes", async () => {
      const updates = { image_path: "new.jpg" };
      const updatedProduct = createMockProduct(updates);
      mockUpdateChain(updatedProduct, "old.jpg");
      const storageRemove = mockStorageRemove();

      await service.updateProduct("test-id", updates);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith("product-images");
      expect(storageRemove).toHaveBeenCalledWith(["old.jpg"]);
    });

    it("does not remove storage when the new image_path equals the existing one", async () => {
      const updates = { image_path: "same.jpg" };
      const updatedProduct = createMockProduct(updates);
      mockUpdateChain(updatedProduct, "same.jpg");
      const storageRemove = mockStorageRemove();

      await service.updateProduct("test-id", updates);

      expect(storageRemove).not.toHaveBeenCalled();
    });

    it("does not remove storage when the previous image_path is null", async () => {
      const updates = { image_path: "new.jpg" };
      const updatedProduct = createMockProduct(updates);
      mockUpdateChain(updatedProduct, null);
      const storageRemove = mockStorageRemove();

      await service.updateProduct("test-id", updates);

      expect(storageRemove).not.toHaveBeenCalled();
    });
  });

  describe("deleteProduct", () => {
    function mockDeleteChain(previousImagePath: string | null) {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(mockSupabaseSuccess(null)),
      });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            mockSupabaseSuccess({ image_path: previousImagePath }),
          ),
        }),
      });
      // deleteProduct calls from("products") twice: once to read image_path
      // before the row disappears, once for the actual delete.
      mockSupabase.from
        .mockReturnValueOnce({ select: mockSelect })
        .mockReturnValueOnce({ delete: mockDelete });
      return { mockDelete, mockSelect };
    }

    it("deletes the product row and removes the bucket image", async () => {
      mockDeleteChain("hero.jpg");
      const storageRemove = mockStorageRemove();

      await service.deleteProduct("test-id");

      expect(mockSupabase.from).toHaveBeenNthCalledWith(1, "products");
      expect(mockSupabase.from).toHaveBeenNthCalledWith(2, "products");
      expect(mockSupabase.storage.from).toHaveBeenCalledWith("product-images");
      expect(storageRemove).toHaveBeenCalledWith(["hero.jpg"]);
    });

    it("skips storage.remove when the product has no image_path", async () => {
      mockDeleteChain(null);
      const storageRemove = mockStorageRemove();

      await service.deleteProduct("test-id");

      expect(storageRemove).not.toHaveBeenCalled();
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    });
  });

  describe("toggleProductVisibility", () => {
    it("toggles product visibility", async () => {
      const toggledProduct = createMockProduct({ is_visible: false });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(toggledProduct)),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ update: mockUpdate });

      const result = await service.toggleProductVisibility("test-id", false);

      expect(mockUpdate).toHaveBeenCalledWith({ is_visible: false });
      expect(result.is_visible).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductsService } from "@/services/products/products.service";
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
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new ProductsService(mockSupabase as any);
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
      const mockOrder = vi.fn().mockResolvedValue(mockSupabaseSuccess(null));
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
        image_url: "https://example.com/image.png",
        game_id: "00000000-0000-0000-0000-000000000001",
        day_of_week: 0,
        start_time: "16:00",
        duration_minutes: 60,
        min_age: 7,
        max_age: 12,
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
    it("updates an existing product", async () => {
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

      const result = await service.updateProduct("test-id", updates);

      expect(mockSupabase.from).toHaveBeenCalledWith("products");
      expect(mockUpdate).toHaveBeenCalledWith(updates);
      expect(result.name).toBe("Updated Name");
    });
  });

  describe("deleteProduct", () => {
    it("deletes a product by id", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(mockSupabaseSuccess(null)),
      });

      mockSupabase.from.mockReturnValue({ delete: mockDelete });

      await service.deleteProduct("test-id");

      expect(mockSupabase.from).toHaveBeenCalledWith("products");
      expect(mockDelete).toHaveBeenCalled();
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

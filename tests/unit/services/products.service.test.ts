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

  describe("getActiveProducts", () => {
    it("returns active products from RPC", async () => {
      const mockProducts = [
        createMockProduct({ id: "1", name: "Product 1" }),
        createMockProduct({ id: "2", name: "Product 2" }),
      ];

      mockSupabase.rpc.mockResolvedValue(
        mockSupabaseSuccess(mockProducts)
      );

      const result = await service.getActiveProducts();

      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_active_products");
      expect(result).toEqual(mockProducts);
    });

    it("returns empty array when no products", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(null));

      const result = await service.getActiveProducts();

      expect(result).toEqual([]);
    });

    it("throws on error", async () => {
      mockSupabase.rpc.mockResolvedValue(
        mockSupabaseError("Database error")
      );

      await expect(service.getActiveProducts()).rejects.toThrow();
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
        price: 49.99,
      };
      const createdProduct = createMockProduct(newProduct);

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess(createdProduct)),
        }),
      });

      mockSupabase.from.mockReturnValue({ insert: mockInsert });

      const result = await service.createProduct(newProduct);

      expect(mockSupabase.from).toHaveBeenCalledWith("products");
      expect(mockInsert).toHaveBeenCalledWith(newProduct);
      expect(result.name).toBe("New Product");
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

  describe("toggleProductStatus", () => {
    it("toggles product active status", async () => {
      const toggledProduct = createMockProduct({ is_active: false });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(toggledProduct)),
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ update: mockUpdate });

      const result = await service.toggleProductStatus("test-id", false);

      expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
      expect(result.is_active).toBe(false);
    });
  });
});

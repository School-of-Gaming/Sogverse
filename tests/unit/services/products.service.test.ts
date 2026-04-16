import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  // createProduct and updateProduct run server-side — the service just
  // builds FormData and POSTs to the admin routes. The orphan-cleanup
  // guarantees live in the route handlers and are covered by the
  // create-product.test.ts and update-product.test.ts integration tests.
  // Here we just verify the service hands the right shape to fetch.

  const mockFetch = vi.fn<typeof fetch>();

  /** Pull the FormData body from the Nth fetch call the service made. */
  function fetchCallFormData(call: number): FormData {
    const [, init] = mockFetch.mock.calls[call];
    return init!.body as FormData;
  }

  describe("createProduct", () => {
    beforeEach(() => {
      mockFetch.mockReset();
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("sends a multipart request with file and JSON metadata", async () => {
      const testImage = new File(["bytes"], "test.jpg", { type: "image/jpeg" });
      const created = createMockProduct({ name: "New Product" });
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ product: created }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await service.createProduct({
        name: "New Product",
        description: "A new product",
        token_cost: 3,
        game_id: "00000000-0000-0000-0000-000000000001",
        day_of_week: 0,
        start_time: "16:00",
        duration_minutes: 60,
        min_age: 7,
        max_age: 12,
        is_remote: true,
        location_id: null,
        spoken_language_code: "en",
        timezone: "Europe/Helsinki",
        image: testImage,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/admin/create-product");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);

      const fd = fetchCallFormData(0);
      expect(fd.get("file")).toBe(testImage);
      const data = JSON.parse(fd.get("data") as string);
      expect(data.name).toBe("New Product");
      expect(data.image).toBeUndefined();

      expect(result.name).toBe("New Product");
    });

    it("surfaces the server error message on failure", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: "boom" }), { status: 400 })
      );

      await expect(
        service.createProduct({
          image: new File(["x"], "x.jpg", { type: "image/jpeg" }),
          name: "X",
          description: "Y",
          token_cost: 1,
          game_id: "g",
          day_of_week: 0,
          start_time: "16:00",
          duration_minutes: 60,
          min_age: 7,
          max_age: 12,
          is_remote: true,
          location_id: null,
          spoken_language_code: "en",
          timezone: "Europe/Helsinki",
        })
      ).rejects.toThrow("boom");
    });
  });

  describe("updateProduct", () => {
    beforeEach(() => {
      mockFetch.mockReset();
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("sends multipart with id and metadata, no file when image is omitted", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ product: createMockProduct({ name: "Renamed" }) }),
          { status: 200 }
        )
      );

      await service.updateProduct("test-id", { name: "Renamed" });

      const fd = fetchCallFormData(0);
      expect(fd.get("id")).toBe("test-id");
      expect(fd.get("file")).toBeNull();
      expect(JSON.parse(fd.get("data") as string)).toEqual({ name: "Renamed" });
    });

    it("attaches the file field only when image is a File", async () => {
      const newImage = new File(["bytes"], "new.png", { type: "image/png" });
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ product: createMockProduct() }), { status: 200 })
      );

      await service.updateProduct("test-id", { name: "X", image: newImage });

      const fd = fetchCallFormData(0);
      expect(fd.get("file")).toBe(newImage);
      // image must not leak into the JSON data payload
      expect(JSON.parse(fd.get("data") as string).image).toBeUndefined();
    });

    it("does not attach the file field when image is null", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ product: createMockProduct() }), { status: 200 })
      );

      await service.updateProduct("test-id", { name: "X", image: null });

      const fd = fetchCallFormData(0);
      expect(fd.get("file")).toBeNull();
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
    beforeEach(() => {
      mockFetch.mockReset();
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("routes through updateProduct as a partial multipart update", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ product: createMockProduct({ is_visible: false }) }),
          { status: 200 }
        )
      );

      const result = await service.toggleProductVisibility("test-id", false);

      const fd = fetchCallFormData(0);
      expect(JSON.parse(fd.get("data") as string)).toEqual({ is_visible: false });
      expect(result.is_visible).toBe(false);
    });
  });
});

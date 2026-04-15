// Uploads a single image file to the product-images bucket via the admin
// API route. Returns the bucket-relative path the caller should store on
// the product row. Reused by the form's file-picker and paste handlers.

export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/admin/upload-product-image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to upload image");
  }

  const { path } = (await response.json()) as { path: string };
  return path;
}

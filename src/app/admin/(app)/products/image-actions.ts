"use server";

/**
 * Product image server actions (T11 Slice 3). Each re-verifies the session, then
 * delegates to `image-write.ts`. The product slug is re-read server-side for the
 * cache bust (never trust a client-passed slug). Returns serializable results.
 */
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadProductImage,
  reorderImages,
  setCoverImage,
  setImageVariant,
  deleteImage,
  type ImageUploadResult,
} from "@/lib/admin/products/image-write";

/** Read a product's slug (server-side, for the cache bust). */
async function slugFor(productId: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("products").select("slug").eq("id", productId).maybeSingle();
  return data?.slug ?? "";
}

/** Upload one image (called per-file from the client). */
export async function uploadImageAction(
  productId: string,
  formData: FormData,
): Promise<ImageUploadResult> {
  await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, reason: "upload-failed" };
  }
  const slug = await slugFor(productId);
  return uploadProductImage(productId, slug, file);
}

/** Persist a new image order. */
export async function reorderImagesAction(
  productId: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  await requireSession();
  const slug = await slugFor(productId);
  return reorderImages(productId, slug, orderedIds);
}

/** Set the cover image. */
export async function setCoverAction(
  productId: string,
  imageId: string,
): Promise<{ ok: boolean }> {
  await requireSession();
  const slug = await slugFor(productId);
  return setCoverImage(productId, slug, imageId);
}

/** Associate an image with a variant (or product-level when variantId is null). */
export async function setImageVariantAction(
  productId: string,
  imageId: string,
  variantId: string | null,
): Promise<{ ok: boolean }> {
  await requireSession();
  const slug = await slugFor(productId);
  return setImageVariant(productId, slug, imageId, variantId);
}

/** Delete an image (row + storage object). */
export async function deleteImageAction(
  productId: string,
  imageId: string,
): Promise<{ ok: boolean }> {
  await requireSession();
  const slug = await slugFor(productId);
  return deleteImage(productId, slug, imageId);
}

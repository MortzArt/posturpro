/**
 * Product image write layer (T11 Slice 3, AC-14..17). Uploads to the
 * `product-images` bucket via the admin client and manages `product_images`
 * rows (create / reorder / set-cover / delete + variant association). All the
 * storage-vs-DB reconciliation lives here behind one interface (research: a
 * filesystem fallback could swap in without touching callers). Server-side MIME
 * + size validation (never trusts the client). Busts `catalog` + `product:<slug>`
 * on every change. `server-only`.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustCatalogTags } from "@/lib/admin/products/cache-tags";
import {
  PRODUCT_IMAGES_BUCKET,
  PRODUCT_IMAGE_MIME_TYPES,
  PRODUCT_IMAGE_EXTENSIONS,
  IMAGE_MAX_BYTES,
} from "@/lib/config";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Outcome of an image upload. */
export type ImageUploadResult =
  | { ok: true; id: string; url: string; sortOrder: number; isPrimary: boolean }
  | { ok: false; reason: "bad-type" | "too-large" | "upload-failed" | "db-failed" };

/** Server-side validation of an uploaded file (never trust the client). */
function validateFile(file: File): "bad-type" | "too-large" | null {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_MIME_TYPES)[number])) {
    return "bad-type";
  }
  if (file.size <= 0 || file.size > IMAGE_MAX_BYTES) return "too-large";
  return null;
}

/**
 * Upload an image for a product: validate, upload to a non-guessable path,
 * insert the `product_images` row (first image of a product becomes the cover).
 * Reconciles a storage/DB divergence: on DB-insert failure the just-uploaded
 * object is best-effort deleted so no orphan lingers.
 */
export async function uploadProductImage(
  productId: string,
  productSlug: string,
  file: File,
): Promise<ImageUploadResult> {
  const invalid = validateFile(file);
  if (invalid) return { ok: false, reason: invalid };

  const db = createAdminClient();
  const extension = PRODUCT_IMAGE_EXTENSIONS[file.type] ?? "bin";
  const path = `${productId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error(`[image-write] upload failed: ${uploadError.message}`);
    return { ok: false, reason: "upload-failed" };
  }

  const { data: publicData } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  const existingCount = await countImages(db, productId);
  const isPrimary = existingCount === 0;

  const { data, error } = await db
    .from("product_images")
    .insert({
      product_id: productId,
      url: publicUrl,
      sort_order: existingCount,
      is_primary: isPrimary,
    })
    .select("id, sort_order, is_primary")
    .single();

  if (error || !data) {
    // Reconcile: drop the just-uploaded object so no orphan file remains.
    await db.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
    console.error(`[image-write] db insert failed, object removed: ${error?.message}`);
    return { ok: false, reason: "db-failed" };
  }

  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true, id: data.id, url: publicUrl, sortOrder: data.sort_order, isPrimary: data.is_primary };
}

/** Count a product's images (used to pick the next sort_order + first-cover). */
async function countImages(db: AdminClient, productId: string): Promise<number> {
  const { count } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  return count ?? 0;
}

/** Persist a new image order (array of image ids in the desired order). */
export async function reorderImages(
  productId: string,
  productSlug: string,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await db
      .from("product_images")
      .update({ sort_order: index })
      .eq("id", orderedIds[index])
      .eq("product_id", productId);
    if (error) {
      console.error(`[image-write] reorder failed: ${error.message}`);
      return { ok: false };
    }
  }
  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true };
}

/** Set a single image as the cover (clears the previous one — at most one). */
export async function setCoverImage(
  productId: string,
  productSlug: string,
  imageId: string,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  const clear = await db
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);
  if (clear.error) {
    console.error(`[image-write] clear cover failed: ${clear.error.message}`);
    return { ok: false };
  }
  const { error } = await db
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("product_id", productId);
  if (error) {
    console.error(`[image-write] set cover failed: ${error.message}`);
    return { ok: false };
  }
  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true };
}

/** Associate an image with a variant (or clear it → product-level). */
export async function setImageVariant(
  productId: string,
  productSlug: string,
  imageId: string,
  variantId: string | null,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  const { error } = await db
    .from("product_images")
    .update({ variant_id: variantId })
    .eq("id", imageId)
    .eq("product_id", productId);
  if (error) {
    console.error(`[image-write] set variant failed: ${error.message}`);
    return { ok: false };
  }
  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true };
}

/**
 * Delete an image: remove the row (source of truth) AND best-effort remove the
 * storage object. A failed storage delete still removes the row and logs the
 * orphan (never blocks the owner). If the deleted image was the cover, promote
 * the next image to cover.
 */
export async function deleteImage(
  productId: string,
  productSlug: string,
  imageId: string,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  const { data: image, error: readError } = await db
    .from("product_images")
    .select("url, is_primary")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();
  if (readError || !image) {
    console.error(`[image-write] delete read failed: ${readError?.message}`);
    return { ok: false };
  }

  const { error } = await db
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId);
  if (error) {
    console.error(`[image-write] delete row failed: ${error.message}`);
    return { ok: false };
  }

  await removeStorageObject(db, image.url);
  if (image.is_primary) await promoteNextCover(db, productId);
  bustCatalogTags({ productSlugs: [productSlug] });
  return { ok: true };
}

/** Best-effort storage-object delete from a public URL (never throws). */
async function removeStorageObject(db: AdminClient, url: string): Promise<void> {
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return; // Not a bucket URL (e.g. a seeded picsum URL) — nothing to remove.
  const path = url.slice(index + marker.length);
  const { error } = await db.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  if (error) {
    console.error(`[image-write] orphan object not removed (kept row): ${error.message}`);
  }
}

/** Promote the first remaining image (by sort order) to cover after a cover delete. */
async function promoteNextCover(db: AdminClient, productId: string): Promise<void> {
  const { data } = await db
    .from("product_images")
    .select("id")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .limit(1);
  const next = data?.[0];
  if (next) {
    await db.from("product_images").update({ is_primary: true }).eq("id", next.id);
  }
}

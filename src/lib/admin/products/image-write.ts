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

/** The image types the sniffer maps to a canonical MIME (SVG deliberately absent). */
type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Sniff an image's leading magic bytes so we never trust the client-declared
 * `file.type` (m-1). JPEG = `FF D8 FF`; PNG = `89 50 4E 47`; WEBP = `RIFF....WEBP`.
 * Returns the canonical MIME derived from the actual bytes, or null if the
 * header matches none (a mislabeled / polyglot / script payload is rejected).
 */
function sniffImageType(header: Uint8Array): SniffedImageType | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    header.length >= 4 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 && // R
    header[1] === 0x49 && // I
    header[2] === 0x46 && // F
    header[3] === 0x46 && // F
    header[8] === 0x57 && // W
    header[9] === 0x45 && // E
    header[10] === 0x42 && // B
    header[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Server-side validation of an uploaded file (never trust the client). Checks
 * the declared MIME + size cheaply, then SNIFFS the leading magic bytes and
 * returns the sniffed canonical type — the caller stores objects under THAT,
 * not `file.type` (m-1). A file whose bytes match no allowed image is rejected.
 */
async function validateFile(
  file: File,
): Promise<{ ok: true; contentType: SniffedImageType } | { ok: false; reason: "bad-type" | "too-large" }> {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_MIME_TYPES)[number])) {
    return { ok: false, reason: "bad-type" };
  }
  if (file.size <= 0 || file.size > IMAGE_MAX_BYTES) return { ok: false, reason: "too-large" };
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sniffed = sniffImageType(header);
  if (!sniffed) return { ok: false, reason: "bad-type" };
  return { ok: true, contentType: sniffed };
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
  const validation = await validateFile(file);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  // Derive the extension + stored content-type from the SNIFFED bytes, never the
  // client-declared file.type (m-1) — a mislabeled payload can't set the type.
  const contentType = validation.contentType;

  const db = createAdminClient();
  const extension = PRODUCT_IMAGE_EXTENSIONS[contentType] ?? "bin";
  const path = `${productId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await db.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { contentType, upsert: false });
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

/**
 * Set a single image as the cover (at most one cover). Sets the NEW cover FIRST,
 * then clears every OTHER image's flag. Ordering it this way means a mid-write
 * failure leaves the product with TWO covers (the storefront still picks one),
 * never ZERO covers as the clear-all-then-set order could (m-4). PostgREST has
 * no single-statement conditional update; an RPC is disproportionate for this
 * single-Owner path, so this ordering is the pragmatic no-cover-gap guarantee.
 */
export async function setCoverImage(
  productId: string,
  productSlug: string,
  imageId: string,
): Promise<{ ok: boolean }> {
  const db = createAdminClient();
  const set = await db
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("product_id", productId);
  if (set.error) {
    console.error(`[image-write] set cover failed: ${set.error.message}`);
    return { ok: false };
  }
  const { error } = await db
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId)
    .neq("id", imageId);
  if (error) {
    console.error(`[image-write] clear other covers failed: ${error.message}`);
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

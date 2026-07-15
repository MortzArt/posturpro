"use server";

/**
 * Product server actions (T11 Slice 2/6). Each re-verifies the session FIRST
 * (`requireSession()` → redirect before any DB touch, AC-11/edge 8), parses via
 * the pure `parseProductInput` (field errors keep the form filled), writes via
 * the admin client, maps a `23505` to a field error, and busts cache tags. Only
 * async functions are exported (T10 rule; state types live in
 * `products-form-state.ts`).
 */
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/admin/require-session";
import { parseProductInput } from "@/lib/admin/products/product-input";
import {
  createProduct,
  updateProduct,
  setProductStatus,
  deleteProduct,
  type ProductWriteResult,
} from "@/lib/admin/products/product-write";
import { duplicateProduct } from "@/lib/admin/products/product-duplicate";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";
import {
  initialProductFormState,
  type ProductFormState,
  type ProductFormValues,
} from "./products-form-state";

/** Read the product-form fields from FormData into the preserved value shape. */
function readProductValues(formData: FormData): ProductFormValues {
  const str = (key: string): string => String(formData.get(key) ?? "");
  return {
    name: str("name"),
    slug: str("slug"),
    description: str("description"),
    brand_id: str("brand_id"),
    style_id: str("style_id"),
    sku: str("sku"),
    price: str("price"),
    compare_at_price: str("compare_at_price"),
    cost_price: str("cost_price"),
    stock: str("stock"),
    status: str("status"),
    width_cm: str("width_cm"),
    depth_cm: str("depth_cm"),
    height_cm: str("height_cm"),
    seat_height_cm: str("seat_height_cm"),
    weight_kg: str("weight_kg"),
    material_frame: str("material_frame"),
    material_upholstery: str("material_upholstery"),
    material_finish: str("material_finish"),
    is_featured: formData.get("is_featured") === "true",
    is_best_seller: formData.get("is_best_seller") === "true",
    category_ids: formData.getAll("category_ids").map(String),
    tag_names: formData.getAll("tag_names").map(String),
  };
}

/** Map a write result into the form state (field error or generic banner). */
function stateFromWriteError(
  result: Extract<ProductWriteResult, { ok: false }>,
  values: ProductFormValues,
  submissionId: number,
): ProductFormState {
  if (result.reason === "duplicate") {
    const field = result.field === "sku" ? "sku" : "slug";
    return {
      status: "invalid",
      fieldErrors: { [field]: result.field === "sku" ? "sku-duplicate" : "slug-duplicate" },
      values,
      submissionId,
    };
  }
  return { status: "error", values, submissionId };
}

/**
 * Create OR update a product. `productId` empty → create (redirects to the new
 * edit page on success); non-empty → update in place (success banner, form
 * stays editable). Bound in the form via `saveProduct.bind(null, id, slug)`.
 */
export async function saveProduct(
  productId: string,
  previousSlug: string,
  prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const submissionId = prevState.submissionId + 1;
  await requireSession();

  const values = readProductValues(formData);
  const parsed = parseProductInput(values);
  if (!parsed.ok) {
    return { status: "invalid", fieldErrors: parsed.fieldErrors, values, submissionId };
  }

  const isCreate = productId.trim() === "";
  const result = isCreate
    ? await createProduct(parsed.values, parsed.categoryIds, parsed.tagNames)
    : await updateProduct(productId, previousSlug, parsed.values, parsed.categoryIds, parsed.tagNames);

  if (!result.ok) {
    return stateFromWriteError(result, values, submissionId);
  }
  if (isCreate) {
    redirect(`${ADMIN_PRODUCTS_PATH}/${result.id}/edit?created=1`);
  }
  return { status: "success", values, submissionId };
}

/** Archive or restore a product (list row menu / edit page). */
export async function changeProductStatus(
  productId: string,
  status: "draft" | "active" | "archived",
): Promise<{ ok: boolean }> {
  await requireSession();
  const result = await setProductStatus(productId, status);
  return { ok: result.ok };
}

/** Delete a product (cascades children); returns ok for the client toast. */
export async function removeProduct(productId: string): Promise<{ ok: boolean }> {
  await requireSession();
  const result = await deleteProduct(productId);
  return { ok: result.ok };
}

/** Duplicate a product and redirect to the copy's edit page (AC-27). */
export async function duplicateProductAction(productId: string): Promise<{ ok: boolean }> {
  await requireSession();
  const result = await duplicateProduct(productId);
  if (result.ok) {
    redirect(`${ADMIN_PRODUCTS_PATH}/${result.id}/edit?duplicated=1`);
  }
  return { ok: false };
}

/** The initial form state (re-exported so the client imports one module). */
export async function getInitialProductFormState(): Promise<ProductFormState> {
  return initialProductFormState;
}

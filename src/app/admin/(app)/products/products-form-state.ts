/**
 * Serializable form-state contracts for the T11 product actions (T10 rule: a
 * `"use server"` module may export ONLY async functions, so the state
 * types/initial values live OUTSIDE `actions.ts`). Mirrors
 * `admin-form-state.ts`. Consumed by `useActionState` in the product form.
 */
import type { ProductFieldError } from "@/lib/admin/products/product-input";

/** Raw product-form values echoed back on any post so the form stays filled. */
export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  brand_id: string;
  style_id: string;
  sku: string;
  price: string;
  compare_at_price: string;
  cost_price: string;
  stock: string;
  status: string;
  width_cm: string;
  depth_cm: string;
  height_cm: string;
  seat_height_cm: string;
  weight_kg: string;
  material_frame: string;
  material_upholstery: string;
  material_finish: string;
  is_featured: boolean;
  is_best_seller: boolean;
  category_ids: string[];
  tag_names: string[];
}

/** The action outcome for `useActionState`. */
export type ProductFormStatus = "idle" | "invalid" | "error" | "success";

export interface ProductFormState {
  status: ProductFormStatus;
  fieldErrors?: Partial<Record<ProductFieldError["field"], ProductFieldError["error"]>>;
  values?: ProductFormValues;
  submissionId: number;
  /** New product id after a successful create (client redirects to its edit page). */
  createdId?: string;
}

export const initialProductFormState: ProductFormState = {
  status: "idle",
  submissionId: 0,
};

/** An empty value set for a fresh "new product" form. */
export const emptyProductFormValues: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  brand_id: "",
  style_id: "",
  sku: "",
  price: "",
  compare_at_price: "",
  cost_price: "",
  stock: "0",
  status: "draft",
  width_cm: "",
  depth_cm: "",
  height_cm: "",
  seat_height_cm: "",
  weight_kg: "",
  material_frame: "",
  material_upholstery: "",
  material_finish: "",
  is_featured: false,
  is_best_seller: false,
  category_ids: [],
  tag_names: [],
};

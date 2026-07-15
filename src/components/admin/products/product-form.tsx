"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Banner,
  MoneyField,
  NumberUnitField,
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
} from "@/components/admin/form/fields";
import { CategoryMultiSelect, TagInput } from "@/components/admin/products/taxonomy-select";
import { UnsavedChangesGuard } from "@/components/admin/products/unsaved-changes-guard";
import { saveProduct } from "@/app/admin/(app)/products/actions";
import {
  emptyProductFormValues,
  initialProductFormState,
  type ProductFormState,
  type ProductFormValues,
} from "@/app/admin/(app)/products/products-form-state";
import { PRODUCT_FIELD_ERROR_MESSAGES } from "@/components/admin/products/product-field-errors";
import { slugify } from "@/lib/admin/products/slug";
import { PRODUCT_NAME_MAX_LENGTH, PRODUCT_DESCRIPTION_MAX_LENGTH, MATERIAL_MAX_LENGTH } from "@/lib/config";
import type { ProductField } from "@/lib/admin/products/product-input";
import type { CategoryOption, TaxonomyOption } from "@/lib/admin/taxonomy/taxonomy-read";

/**
 * ProductForm (T11 Slice 2, AC-9..13) — one long form, one submit. SSR-populated
 * (no skeleton). Follows the T10 contract: `useActionState`, pending disables +
 * "Guardando…", collect-all field errors + error-summary + focus-first-invalid,
 * duplicate slug/SKU → field error, success banner (edit) / redirect (create).
 * Slug auto-suggests from the name until the owner edits it. Unsaved-changes
 * guard + beforeunload prevent silent data loss.
 */
interface ProductFormProps {
  productId: string;
  previousSlug: string;
  initialValues: ProductFormValues;
  isEdit: boolean;
  brands: TaxonomyOption[];
  styles: TaxonomyOption[];
  categories: CategoryOption[];
  tagSuggestions: string[];
  /** Sections rendered only on edit (need a product id): images/variants/Q&A. */
  editSections?: React.ReactNode;
}

/** The order the error summary + focus-first-invalid walk fields. */
const FIELD_ORDER: ProductField[] = [
  "name", "slug", "description", "sku", "price", "compare_at_price", "cost_price",
  "stock", "status", "width_cm", "depth_cm", "height_cm", "seat_height_cm",
  "weight_kg", "material_frame", "material_upholstery", "material_finish",
];

export function ProductForm(props: ProductFormProps) {
  const { productId, previousSlug, initialValues, isEdit } = props;
  const router = useRouter();
  const boundSave = saveProduct.bind(null, productId, previousSlug);
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    boundSave,
    initialProductFormState,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugAuto, setSlugAuto] = useState(initialValues.slug === "");

  const values = state.values ?? initialValues;

  // A successful save clears the dirty flag — done during render (adjust-state-
  // on-prop-change pattern, no effect) keyed on the submissionId of the success.
  if (state.status === "success" && savedAt !== state.submissionId) {
    setSavedAt(state.submissionId);
    if (dirty) setDirty(false);
  }

  // Focus management after a submit (DOM side-effect → effect is correct here).
  useEffect(() => {
    if (state.status === "success") {
      successRef.current?.focus();
    } else if (state.status === "invalid") {
      focusFirstInvalid(formRef.current, state.fieldErrors);
    }
  }, [state.status, state.submissionId, state.fieldErrors]);

  const onNameChange = (next: string): void => {
    setName(next);
    setDirty(true);
    if (slugAuto) setSlug(slugify(next));
  };

  const err = (field: ProductField): string | null => {
    const key = state.fieldErrors?.[field];
    return key ? PRODUCT_FIELD_ERROR_MESSAGES[key] : null;
  };

  const errorCount = state.fieldErrors ? Object.keys(state.fieldErrors).length : 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onChange={() => setDirty(true)}
      data-testid="admin-product-form"
      className="flex flex-col gap-6"
    >
      <UnsavedChangesGuard dirty={dirty} />

      <div className="sticky top-0 z-30 -mx-4 flex items-center justify-end gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          data-testid="admin-product-cancel"
          onClick={() => router.push("/admin/products")}
        >
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending} data-testid="admin-product-submit">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      {state.status === "success" ? (
        <Banner
          key={state.submissionId}
          ref={successRef}
          role="status"
          tone="info"
          icon={CheckmarkCircle02Icon}
          message="Producto guardado."
          testid="admin-product-success"
        />
      ) : null}

      {state.status === "invalid" && errorCount > 0 ? (
        <Banner
          key={`err-${state.submissionId}`}
          role="alert"
          tone="error"
          icon={Alert02Icon}
          message={`Corrige ${errorCount} ${errorCount === 1 ? "campo" : "campos"}.`}
          testid="admin-product-error-summary"
        />
      ) : null}

      {/* Remount the uncontrolled fields on each submission so their
          defaultValue re-seeds from the server-echoed state.values on an invalid
          response instead of retaining stale DOM values (m-8). Controlled
          name/slug read from surviving useState, so a remount is a no-op for
          them. `contents` keeps the form's flex gap intact. */}
      <div key={state.submissionId} className="contents">
      <Section title="General" id="general">
        <TextField
          name="name"
          label="Nombre"
          required
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          error={err("name")}
          disabled={pending}
          testid="admin-product-name"
        />
        <TextField
          name="slug"
          label="Slug"
          required
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugAuto(false);
            setDirty(true);
          }}
          error={err("slug")}
          disabled={pending}
          testid="admin-product-slug"
          helper="Minúsculas, sin espacios (se genera del nombre)."
          inputClassName="font-mono"
        />
        <TextareaField
          name="description"
          label="Descripción"
          defaultValue={values.description}
          maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
          error={err("description")}
          disabled={pending}
          testid="admin-product-description"
        />
        <SelectField
          name="status"
          label="Estado"
          defaultValue={values.status}
          error={err("status")}
          disabled={pending}
          testid="admin-product-status"
          options={[
            { value: "draft", label: "Borrador" },
            { value: "active", label: "Activo" },
            { value: "archived", label: "Archivado" },
          ]}
        />
      </Section>

      <Section title="Precios" id="precios">
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField name="price" label="Precio" defaultValue={values.price} error={err("price")} disabled={pending} testid="admin-product-price" />
          <MoneyField name="compare_at_price" label="Precio comparado" defaultValue={values.compare_at_price} error={err("compare_at_price")} disabled={pending} testid="admin-product-compare" placeholder="opcional" />
        </div>
        <MoneyField
          name="cost_price"
          label="Costo"
          labelSuffix={
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
              no visible para clientes
            </span>
          }
          helper="Uso interno para tus márgenes."
          defaultValue={values.cost_price}
          error={err("cost_price")}
          disabled={pending}
          testid="admin-product-cost"
          placeholder="opcional"
        />
      </Section>

      <Section title="Inventario" id="inventario">
        <TextField name="sku" label="SKU" required defaultValue={values.sku} error={err("sku")} disabled={pending} testid="admin-product-sku" inputClassName="font-mono" />
        <NumberUnitField
          name="stock"
          label="Stock del producto"
          defaultValue={values.stock}
          error={err("stock")}
          disabled={pending}
          testid="admin-product-stock"
          helper="Se usa cuando el producto no tiene variantes. Con variantes, el stock se administra por variante."
        />
      </Section>

      <Section title="Organización" id="organizacion">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="brand_id" label="Marca" defaultValue={values.brand_id} disabled={pending} testid="admin-product-brand" options={[{ value: "", label: "Sin marca" }, ...props.brands]} />
          <SelectField name="style_id" label="Estilo" defaultValue={values.style_id} disabled={pending} testid="admin-product-style" options={[{ value: "", label: "Sin estilo" }, ...props.styles]} />
        </div>
        <CategoryMultiSelect options={props.categories} defaultSelected={values.category_ids} disabled={pending} />
        <TagInput defaultTags={values.tag_names} suggestions={props.tagSuggestions} disabled={pending} />
      </Section>

      <Section title="Dimensiones" id="dimensiones">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberUnitField name="width_cm" label="Ancho" unit="cm" defaultValue={values.width_cm} error={err("width_cm")} disabled={pending} testid="admin-product-width" />
          <NumberUnitField name="depth_cm" label="Profundidad" unit="cm" defaultValue={values.depth_cm} error={err("depth_cm")} disabled={pending} testid="admin-product-depth" />
          <NumberUnitField name="height_cm" label="Alto" unit="cm" defaultValue={values.height_cm} error={err("height_cm")} disabled={pending} testid="admin-product-height" />
          <NumberUnitField name="seat_height_cm" label="Altura del asiento" unit="cm" defaultValue={values.seat_height_cm} error={err("seat_height_cm")} disabled={pending} testid="admin-product-seat" />
        </div>
        <NumberUnitField name="weight_kg" label="Peso" unit="kg" defaultValue={values.weight_kg} error={err("weight_kg")} disabled={pending} testid="admin-product-weight" />
      </Section>

      <Section title="Materiales" id="materiales">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="material_frame" label="Material del armazón" maxLength={MATERIAL_MAX_LENGTH} defaultValue={values.material_frame} error={err("material_frame")} disabled={pending} testid="admin-product-frame" />
          <TextField name="material_upholstery" label="Material de tapicería" maxLength={MATERIAL_MAX_LENGTH} defaultValue={values.material_upholstery} error={err("material_upholstery")} disabled={pending} testid="admin-product-upholstery" />
          <TextField name="material_finish" label="Acabado" maxLength={MATERIAL_MAX_LENGTH} defaultValue={values.material_finish} error={err("material_finish")} disabled={pending} testid="admin-product-finish" />
        </div>
        <div className="flex flex-col gap-2">
          <SwitchField name="is_featured" label="Producto destacado" defaultChecked={values.is_featured} disabled={pending} testid="admin-product-featured" />
          <SwitchField name="is_best_seller" label="Más vendido" defaultChecked={values.is_best_seller} disabled={pending} testid="admin-product-best-seller" />
        </div>
      </Section>
      </div>

      {state.status === "error" ? (
        <Banner role="alert" tone="error" icon={Alert02Icon} message="No se pudo guardar. Intenta de nuevo." testid="admin-product-write-error" />
      ) : null}

      {isEdit ? props.editSections : null}
    </form>
  );
}

/** A titled section card (fieldset) with an anchor id for the scroll rail. */
function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <fieldset id={id} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Focus the first field (in declared order) that carries an error. */
function focusFirstInvalid(
  form: HTMLFormElement | null,
  fieldErrors: ProductFormState["fieldErrors"],
): void {
  if (!form || !fieldErrors) return;
  for (const field of FIELD_ORDER) {
    if (fieldErrors[field]) {
      const el = form.querySelector<HTMLElement>(`[data-testid="admin-product-${fieldKeyToTestid(field)}"]`);
      el?.focus();
      return;
    }
  }
}

/** Map a field key to the testid suffix used on its input. */
function fieldKeyToTestid(field: ProductField): string {
  const map: Partial<Record<ProductField, string>> = {
    compare_at_price: "compare",
    cost_price: "cost",
    seat_height_cm: "seat",
    width_cm: "width",
    depth_cm: "depth",
    height_cm: "height",
    weight_kg: "weight",
    material_frame: "frame",
    material_upholstery: "upholstery",
    material_finish: "finish",
  };
  return map[field] ?? field;
}

// Keep the empty-values export reachable for the "new" page without an extra import.
export { emptyProductFormValues };

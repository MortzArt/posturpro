"use client";

import { useState, useTransition } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, Delete02Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Banner, FieldError } from "@/components/admin/form/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { saveVariantsAction } from "@/app/admin/(app)/products/variant-actions";
import { formatMXN } from "@/lib/money";
import { COLOR_HEX_PATTERN } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { VariantRawInput, VariantRowErrors } from "@/lib/admin/products/variant-input";
import type { EditVariant } from "@/lib/admin/products/product-read";

/**
 * VariantEditor (T11 Slice 4, AC-18..20) — inline-editable variant rows saved
 * with a dedicated "Guardar variantes" action. Add appends a blank row; delete
 * confirms (warning of associated images). Per-field errors surface inline after
 * a save. Enabling the first variant means product stock is managed here.
 */
const VARIANT_ERROR_COPY: Record<string, string> = {
  "color-required": "Ingresa el color.",
  "color-too-long": "Nombre de color demasiado largo.",
  "hex-invalid": "Usa un color hex de 6 dígitos, p. ej. #111111.",
  "sku-required": "Ingresa el SKU.",
  "sku-duplicate": "Ya existe una variante/producto con ese SKU.",
  "price-invalid": "Precio inválido.",
  "stock-invalid": "Stock inválido.",
  "id-invalid": "Identificador de variante inválido. Recarga e intenta de nuevo.",
};

/** DraftVariant IS a VariantRawInput (which now carries the stable `key`). */
type DraftVariant = VariantRawInput;

export function VariantEditor({
  productId,
  basePrice,
  initialVariants,
}: {
  productId: string;
  basePrice: string;
  initialVariants: EditVariant[];
}) {
  const [rows, setRows] = useState<DraftVariant[]>(
    initialVariants.map((variant, index) => toDraft(variant, index)),
  );
  const [errors, setErrors] = useState<Record<string, VariantRowErrors>>({});
  const [writeError, setWriteError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const update = (key: string, field: keyof VariantRawInput, value: string): void => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    setSaved(false);
  };

  const addRow = (): void => {
    setRows((prev) => [...prev, toDraft(emptyVariant(), prev.length)]);
    setSaved(false);
  };

  const confirmDelete = (): void => {
    setRows((prev) => prev.filter((row) => row.key !== pendingDeleteKey));
    setPendingDeleteKey(null);
    setSaved(false);
  };

  const onSave = (): void => {
    setErrors({});
    setWriteError(false);
    startTransition(async () => {
      const payload = rows.map((row, index) => ({ ...toRaw(row), sortOrder: index }));
      const result = await saveVariantsAction(productId, payload);
      if (result.ok) {
        setSaved(true);
        return;
      }
      if ("rowErrors" in result) setErrors(result.rowErrors);
      else setWriteError(true);
    });
  };

  return (
    <fieldset id="variantes" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold tracking-tight">Variantes</legend>
      <p className="text-xs text-muted-foreground">
        Cuando hay variantes, el stock y el precio se administran aquí. Precio en blanco = usa el precio base.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin variantes; se usa el stock y precio del producto.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-variant-rows">
          {rows.map((row) => (
            <VariantRow
              key={row.key}
              row={row}
              basePrice={basePrice}
              errors={errors[row.key]}
              onChange={(field, value) => update(row.key, field, value)}
              onDelete={() => setPendingDeleteKey(row.key)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow} data-testid="admin-variant-add">
          <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} aria-hidden />
          Agregar variante
        </Button>
        <Button type="button" size="sm" onClick={onSave} data-testid="admin-variant-save">
          Guardar variantes
        </Button>
        {saved ? <span className="text-xs text-muted-foreground" role="status">Variantes guardadas.</span> : null}
      </div>

      {writeError ? (
        <Banner role="alert" tone="error" icon={Alert02Icon} message="No se pudieron guardar las variantes." testid="admin-variant-error" />
      ) : null}

      <AlertDialog open={pendingDeleteKey !== null} onOpenChange={(open) => !open && setPendingDeleteKey(null)}>
        <AlertDialogContent className="dialog-content-motion">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar variante?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará al guardar. Las imágenes asociadas a esta variante también se quitarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="admin-variant-delete-confirm">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}

function VariantRow({
  row, basePrice, errors, onChange, onDelete,
}: {
  row: DraftVariant;
  basePrice: string;
  errors: VariantRowErrors | undefined;
  onChange: (field: keyof VariantRawInput, value: string) => void;
  onDelete: () => void;
}) {
  const hexValid = COLOR_HEX_PATTERN.test(row.colorHex.trim());
  const cellClasses =
    "min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-2 sm:grid sm:grid-cols-[1fr_auto_1fr_auto_auto_auto] sm:items-center sm:gap-2">
      <input aria-label="Color" placeholder="Color" value={row.colorName} onChange={(e) => onChange("colorName", e.target.value)} className={cellClasses} data-testid="admin-variant-color" />
      <span className="flex items-center gap-1">
        <span aria-hidden className="size-4 shrink-0 rounded-sm border border-border" style={{ background: hexValid ? row.colorHex : "transparent" }} />
        <input aria-label={`Color hex ${row.colorHex}`} placeholder="#111111" value={row.colorHex} onChange={(e) => onChange("colorHex", e.target.value)} className={cn(cellClasses, "w-24 font-mono")} data-testid="admin-variant-hex" />
      </span>
      <input aria-label="SKU" placeholder="SKU" value={row.sku} onChange={(e) => onChange("sku", e.target.value)} className={cn(cellClasses, "font-mono")} data-testid="admin-variant-sku" />
      <input aria-label="Precio (blanco = base)" inputMode="decimal" placeholder={basePrice ? `hereda ${formatMXNSafe(basePrice)}` : "base"} value={row.priceOverride} onChange={(e) => onChange("priceOverride", e.target.value)} className={cn(cellClasses, "w-24 tabular-nums")} data-testid="admin-variant-price" />
      <input aria-label="Stock" inputMode="numeric" placeholder="0" value={row.stock} onChange={(e) => onChange("stock", e.target.value)} className={cn(cellClasses, "w-16 tabular-nums")} data-testid="admin-variant-stock" />
      <button type="button" aria-label="Eliminar variante" onClick={onDelete} className="inline-flex size-9 items-center justify-center justify-self-end rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/30 sm:size-8" data-testid="admin-variant-delete">
        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} aria-hidden />
      </button>
      {errors ? (
        <div className="sm:col-span-6">
          {Object.entries(errors).map(([field, key]) => (
            <FieldError key={field} id={`${row.key}-${field}`} testid={`admin-variant-error-${field}`} message={VARIANT_ERROR_COPY[key]} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** Format a peso string safely (invalid → returns "$0.00" via cents 0). */
function formatMXNSafe(pesos: string): string {
  const cents = Math.round(Number(pesos) * 100);
  return Number.isFinite(cents) ? formatMXN(cents) : "";
}

function toDraft(variant: EditVariant, index: number): DraftVariant {
  return {
    key: variant.id || `new-${index}-${Math.random().toString(36).slice(2)}`,
    id: variant.id,
    colorName: variant.colorName,
    colorHex: variant.colorHex,
    sku: variant.sku,
    priceOverride: variant.priceOverride,
    stock: String(variant.stock),
    sortOrder: variant.sortOrder,
  };
}

function toRaw(draft: DraftVariant): VariantRawInput {
  return {
    key: draft.key,
    id: draft.id,
    colorName: draft.colorName,
    colorHex: draft.colorHex,
    sku: draft.sku,
    priceOverride: draft.priceOverride,
    stock: draft.stock,
    sortOrder: draft.sortOrder,
  };
}

function emptyVariant(): EditVariant {
  return { id: "", sku: "", colorName: "", colorHex: "#000000", priceOverride: "", stock: 0, sortOrder: 0 };
}

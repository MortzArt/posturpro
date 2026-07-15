"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldError, SelectField, TextField } from "@/components/admin/form/fields";
import { adjustInventory } from "@/app/admin/(app)/products/inventory-actions";
import {
  previewResultingStock,
  type AdjustmentMode,
  type InventoryTarget,
} from "@/lib/admin/inventory/inventory-input";
import { ADJUSTMENT_REASON_MAX_LENGTH } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * InventoryAdjustDialog (T11 Slice 6, AC-25/26, edge 6/7) — manual stock change
 * with an explicit target (product vs. variant), a required reason, and a live
 * resulting-stock preview that blocks a negative result. Calls the atomic RPC
 * via `adjustInventory`. Reduced-motion handled by `.dialog-content-motion`.
 */
interface InventoryAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  hasVariants: boolean;
  productStock: number;
  variants: InventoryTarget[];
  /** Show a note that variant stock is managed on the edit page (list context). */
  usesVariantStockNote?: boolean;
  onAdjusted: () => void;
}

const AMOUNT_ERRORS: Record<string, string> = {
  "amount-invalid": "Ingresa un número entero válido.",
  "result-negative": "El inventario no puede quedar negativo.",
};

export function InventoryAdjustDialog({
  open,
  onOpenChange,
  productId,
  productName,
  hasVariants,
  productStock,
  variants,
  usesVariantStockNote,
  onAdjusted,
}: InventoryAdjustDialogProps) {
  const [pending, startTransition] = useTransition();
  const [targetVariantId, setTargetVariantId] = useState<string>(
    hasVariants && variants[0] ? variants[0].variantId ?? "" : "",
  );
  const [mode, setMode] = useState<AdjustmentMode>("delta");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState(false);

  const currentStock = resolveCurrentStock(hasVariants, variants, targetVariantId, productStock);
  const parsedAmount = /^-?\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const preview =
    parsedAmount === null ? null : previewResultingStock(mode, parsedAmount, currentStock);
  const wouldGoNegative = preview !== null && preview < 0;

  const onSubmit = (): void => {
    setAmountError(null);
    setReasonError(null);
    setWriteError(false);
    startTransition(async () => {
      const variantId = hasVariants ? targetVariantId || null : null;
      const result = await adjustInventory(productId, variantId, mode, amount, reason);
      if (result.ok) {
        onOpenChange(false);
        resetForm();
        onAdjusted();
        return;
      }
      if (result.field === "amount") setAmountError(AMOUNT_ERRORS[result.error] ?? AMOUNT_ERRORS["amount-invalid"]);
      else if (result.field === "reason")
        setReasonError(
          result.error === "reason-too-long"
            ? `El motivo no puede superar ${ADJUSTMENT_REASON_MAX_LENGTH} caracteres.`
            : "Ingresa un motivo.",
        );
      else setWriteError(true);
    });
  };

  const resetForm = (): void => {
    setAmount("");
    setReason("");
    setMode("delta");
  };

  const targetLabel = hasVariants
    ? variants.find((variant) => (variant.variantId ?? "") === targetVariantId)?.label ??
      "Variante"
    : "Producto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-content-motion" data-testid="inventory-adjust-dialog">
        <DialogHeader>
          <DialogTitle>Ajustar inventario</DialogTitle>
          <DialogDescription>
            {productName} — {targetLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {hasVariants ? (
            <SelectField
              name="variant"
              label="Variante"
              testid="inventory-adjust-target"
              value={targetVariantId}
              onChange={(event) => setTargetVariantId(event.target.value)}
              options={variants.map((variant) => ({
                value: variant.variantId ?? "",
                label: variant.label,
              }))}
            />
          ) : null}

          <p className="text-sm text-muted-foreground">
            Stock actual:{" "}
            <span className="font-medium tabular-nums text-foreground" data-testid="inventory-adjust-current">
              {currentStock}
            </span>
          </p>

          {usesVariantStockNote ? (
            <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground" role="note">
              Este producto usa stock por variante. Aquí ajustas el stock del
              producto; para ajustar una variante, ábrelo y ve a Inventario.
            </p>
          ) : null}

          <fieldset className="flex gap-4" aria-label="Modo de ajuste">
            <ModeRadio label="Ajuste (±)" checked={mode === "delta"} onSelect={() => setMode("delta")} testid="inventory-mode-delta" />
            <ModeRadio label="Nuevo total" checked={mode === "absolute"} onSelect={() => setMode("absolute")} testid="inventory-mode-absolute" />
          </fieldset>

          <TextField
            name="amount"
            label={mode === "delta" ? "Cantidad (± para sumar o restar)" : "Nuevo total"}
            testid="inventory-adjust-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            // Surface the negative-result case as THIS field's error so it wires
            // into the input's aria-describedby for SR users (m-7).
            error={wouldGoNegative ? "El inventario no puede quedar negativo." : amountError}
            inputClassName="tabular-nums"
          />

          <TextField
            name="reason"
            label="Motivo"
            required
            testid="inventory-adjust-reason"
            maxLength={ADJUSTMENT_REASON_MAX_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reasonError}
            helper="Queda registrado en el historial."
          />

          {preview !== null ? (
            <p
              className={cn(
                "text-sm tabular-nums",
                wouldGoNegative ? "text-destructive" : "text-muted-foreground",
              )}
              data-testid="inventory-adjust-preview"
            >
              Resultado: {currentStock} → {preview}{" "}
              {parsedAmount !== null && mode === "delta"
                ? `(${parsedAmount >= 0 ? "+" : ""}${parsedAmount})`
                : null}
            </p>
          ) : null}

          {writeError ? (
            <FieldError
              id="inventory-write-error"
              testid="inventory-adjust-error"
              message="No se pudo ajustar. Intenta de nuevo."
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || wouldGoNegative || amount.trim() === "" || reason.trim() === ""}
            data-testid="inventory-adjust-submit"
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resolve which stock the dialog currently targets. */
function resolveCurrentStock(
  hasVariants: boolean,
  variants: InventoryTarget[],
  targetVariantId: string,
  productStock: number,
): number {
  if (!hasVariants) return productStock;
  const target = variants.find((variant) => (variant.variantId ?? "") === targetVariantId);
  return target?.stock ?? 0;
}

function ModeRadio({
  label,
  checked,
  onSelect,
  testid,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  testid: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="radio"
        name="adjust-mode"
        checked={checked}
        onChange={onSelect}
        data-testid={testid}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TextareaField, FieldError } from "@/components/admin/form/fields";
import { cancelOrder } from "@/app/admin/(app)/orders/actions";
import { INTERNAL_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";

/**
 * CancelOrderDialog (T12 Surface 4, AC-13/14, edge 3) — confirm + cancel with an
 * optional customer-facing reason. Shows a warning line when the order was
 * already shipped/delivered (edge 3). Non-dismissable while pending. Mirrors
 * `TaxonomyDeleteDialog`'s AlertDialog grammar. Success → parent refreshes.
 */
interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  /** True when the order is at shipped/delivered — surfaces the edge-3 warning. */
  alreadyShipped: boolean;
  onCancelled: (emailSent: boolean) => void;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  alreadyShipped,
  onCancelled,
}: CancelOrderDialogProps) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  const handleOpenChange = (next: boolean): void => {
    if (pending) return;
    if (!next) {
      setReason("");
      setError(false);
    }
    onOpenChange(next);
  };

  const onConfirm = (): void => {
    setError(false);
    startTransition(async () => {
      const result = await cancelOrder(orderId, reason.trim() || undefined);
      if (result.ok) {
        setReason("");
        onOpenChange(false);
        onCancelled(result.emailSent);
        return;
      }
      setError(true);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="dialog-content-motion" data-testid="cancel-order-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar el pedido {orderNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se restaurará el stock de los artículos y el pedido quedará como
            Cancelado. El cliente recibirá un correo de cancelación.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {alreadyShipped ? (
          <p
            role="alert"
            className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400"
            data-testid="cancel-shipped-warning"
          >
            ⚠ El pedido ya fue enviado.
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <TextareaField
            name="reason"
            label="Motivo (opcional, se envía al cliente)"
            testid="cancel-reason"
            rows={3}
            maxLength={INTERNAL_NOTE_MAX_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
          />
          {error ? (
            <FieldError id="cancel-error" testid="cancel-error" message="No se pudo cancelar el pedido." />
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
            data-testid="cancel-confirm"
          >
            {pending ? "Cancelando…" : "Cancelar pedido"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

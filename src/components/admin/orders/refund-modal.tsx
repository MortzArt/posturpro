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
import { TextField, FieldError } from "@/components/admin/form/fields";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { refundOrder } from "@/app/admin/(app)/orders/actions";
import type { RefundOrderActionResult } from "@/lib/admin/orders/order-action-types";

/**
 * RefundModal (T12 Surface 3, AC-16..20) — the highest-risk action: a two-step
 * `Dialog` (compose → typed-REEMBOLSAR confirmation). Non-dismissable while the
 * MP call is in flight (prevents double-submit). A STABLE idempotency key is
 * minted once per open→submit cycle (AC-19): retry-safe at MP, distinct partials
 * never collide. Raw MP errors are NEVER shown — the typed result maps to a
 * friendly es-MX message.
 */
interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  totalCents: number;
  refundedCents: number;
  /** Receives the ACTUAL `emailSent` outcome so the banner can flag a failed refund-issued email (AC-10 / edge 7). */
  onRefunded: (emailSent: boolean) => void;
}

const CONFIRM_WORD = "REEMBOLSAR";

/**
 * A random suffix for the idempotency key. `crypto.randomUUID()` throws in a
 * non-secure context (plain-http non-localhost); admin is HTTPS-only in prod, but
 * fall back to a timestamp+random token so `goToConfirm` never surfaces an
 * uncaught error on a misconfigured host (m-2). Uniqueness (not cryptographic
 * strength) is all the idempotency key needs.
 */
function randomKeySuffix(): string {
  const cryptoRef = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    try {
      return cryptoRef.randomUUID();
    } catch {
      // Falls through to the non-crypto token below.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const ERROR_COPY: Record<Exclude<RefundOrderActionResult, { ok: true }>["reason"], string> = {
  "over-refund": "El monto supera el saldo reembolsable.",
  "mp-error": "No se pudo procesar el reembolso. Intenta de nuevo.",
  "not-refundable": "Este pago no es reembolsable.",
  error: "Ocurrió un problema. Revisa el panel de Mercado Pago antes de reintentar.",
  invalid: "Ingresa un monto válido.",
};

export function RefundModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  totalCents,
  refundedCents,
  onRefunded,
}: RefundModalProps) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const remainingCents = Math.max(0, totalCents - refundedCents);
  const amountPesos = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const amountCents = amountPesos === null ? null : amountPesos * 100;
  const partialInvalid =
    mode === "partial" && (amountCents === null || amountCents <= 0 || amountCents > remainingCents);
  const effectiveCents = mode === "full" ? remainingCents : amountCents ?? 0;

  const reset = (): void => {
    setStep(1);
    setMode("full");
    setAmount("");
    setConfirmText("");
    setError(null);
    setIdempotencyKey("");
  };

  const handleOpenChange = (next: boolean): void => {
    // Non-dismissable while the request is in flight (prevents double-submit).
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const goToConfirm = (): void => {
    if (partialInvalid) {
      setError(ERROR_COPY["over-refund"]);
      return;
    }
    setError(null);
    // Mint the stable idempotency key ONCE for this open→submit cycle (AC-19).
    setIdempotencyKey(`refund:${orderId}:${randomKeySuffix()}`);
    setStep(2);
  };

  const submit = (): void => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setError(null);
    startTransition(async () => {
      const result = await refundOrder(
        orderId,
        mode === "full" ? { mode: "full" } : { mode: "partial", amountMxn: amountPesos ?? 0 },
        idempotencyKey,
      );
      if (result.ok) {
        reset();
        onOpenChange(false);
        onRefunded(result.emailSent);
        return;
      }
      setError(ERROR_COPY[result.reason]);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="dialog-content-motion" data-testid="refund-modal">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Reembolsar pedido {orderNumber}</DialogTitle>
              <DialogDescription className="sr-only">
                Elige un reembolso total o parcial.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <dl className="flex flex-col gap-1 text-sm">
                <Row label="Total pagado" value={formatMXN(totalCents)} />
                <Row label="Ya reembolsado" value={formatMXN(refundedCents)} />
                <Row label="Saldo reembolsable" value={formatMXN(remainingCents)} emphasis />
              </dl>
              <fieldset className="flex flex-col gap-2" aria-label="Tipo de reembolso">
                <RefundRadio
                  label={`Reembolso total (${formatMXN(remainingCents)})`}
                  checked={mode === "full"}
                  onSelect={() => setMode("full")}
                  testid="refund-mode-full"
                />
                <RefundRadio
                  label="Reembolso parcial"
                  checked={mode === "partial"}
                  onSelect={() => setMode("partial")}
                  testid="refund-mode-partial"
                />
              </fieldset>
              {mode === "partial" ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="refund-amount" className="text-sm font-medium">
                    Monto
                  </label>
                  <div
                    className={cn(
                      "flex min-h-11 items-stretch rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
                      partialInvalid && amount.trim() !== "" && "border-destructive ring-2 ring-destructive/20",
                    )}
                  >
                    <span className="flex items-center border-r border-border px-3 text-sm text-muted-foreground" aria-hidden>
                      $
                    </span>
                    <input
                      id="refund-amount"
                      inputMode="decimal"
                      type="text"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0"
                      data-testid="refund-amount"
                      aria-invalid={partialInvalid && amount.trim() !== "" ? true : undefined}
                      aria-describedby={cn(
                        "refund-amount-hint",
                        error ? "refund-step1-error" : undefined,
                      )}
                      className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-foreground outline-none"
                    />
                  </div>
                  <p id="refund-amount-hint" className="text-xs text-muted-foreground">
                    El monto no puede superar el saldo reembolsable.
                  </p>
                </div>
              ) : null}
              <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground" role="note">
                ⚠ Esta acción mueve dinero real y no se puede deshacer.
              </p>
              {error ? (
                <FieldError id="refund-step1-error" testid="refund-error" message={error} />
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={goToConfirm}
                disabled={remainingCents <= 0 || (mode === "partial" && partialInvalid)}
                data-testid="refund-continue"
              >
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar reembolso</DialogTitle>
              <DialogDescription className="sr-only">
                Escribe REEMBOLSAR para confirmar.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Vas a reembolsar{" "}
                <strong className="tabular-nums">{formatMXN(effectiveCents)}</strong> a este pago.
              </p>
              {/* Passing `error` wires aria-invalid + aria-describedby on the
                  input and renders the associated FieldError (m-3). */}
              <TextField
                name="confirm"
                label={`Escribe ${CONFIRM_WORD} para confirmar`}
                testid="refund-confirm-input"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                disabled={pending}
                error={error}
                inputClassName="uppercase tracking-wide"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                Atrás
              </Button>
              <Button
                onClick={submit}
                disabled={pending || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
                data-testid="refund-submit"
              >
                {pending ? "Procesando…" : "Reembolsar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", emphasis && "font-semibold text-foreground")}>{value}</dd>
    </div>
  );
}

function RefundRadio({
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
        name="refund-mode"
        checked={checked}
        onChange={onSelect}
        data-testid={testid}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/admin/form/fields";
import { setTracking } from "@/app/admin/(app)/orders/actions";
import {
  TRACKING_NUMBER_MAX_LENGTH,
  TRACKING_CARRIER_MAX_LENGTH,
  TRACKING_URL_MAX_LENGTH,
} from "@/lib/admin/orders/order-tracking-input";

/**
 * TrackingForm (T12 Surface 5, AC-11/12) — inline card (frequent, low-risk → not
 * a modal). An EMPTY tracking number is valid (ship without tracking). On save it
 * persists the three columns; when the order is later advanced to `shipped`, the
 * values thread into `sendShipped`. Shows an inline success/error line.
 */
interface TrackingFormProps {
  orderId: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingUrl: string | null;
}

const ERROR_COPY: Record<string, string> = {
  "too-long": "Alguno de los campos es demasiado largo.",
  "url-invalid": "La URL de rastreo no es válida.",
  "not-found": "No se encontró el pedido.",
  error: "No se pudo guardar la guía.",
};

export function TrackingForm({ orderId, trackingNumber, carrier, trackingUrl }: TrackingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState(trackingNumber ?? "");
  const [carrierValue, setCarrierValue] = useState(carrier ?? "");
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSave = (): void => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setTracking(orderId, {
        trackingNumber: number,
        carrier: carrierValue,
        trackingUrl: url,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
        return;
      }
      setError(ERROR_COPY[result.reason] ?? ERROR_COPY.error);
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="tracking-form">
      <TextField
        name="trackingNumber"
        label="Número de guía (opcional)"
        testid="tracking-number"
        maxLength={TRACKING_NUMBER_MAX_LENGTH}
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        disabled={pending}
      />
      <TextField
        name="carrier"
        label="Paquetería"
        testid="tracking-carrier"
        maxLength={TRACKING_CARRIER_MAX_LENGTH}
        value={carrierValue}
        onChange={(event) => setCarrierValue(event.target.value)}
        disabled={pending}
      />
      <TextField
        name="trackingUrl"
        label="URL de rastreo (opcional)"
        type="url"
        testid="tracking-url"
        maxLength={TRACKING_URL_MAX_LENGTH}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        error={error}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={onSave} disabled={pending} data-testid="tracking-save">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !error ? (
          <span role="status" className="enter-fade text-xs text-emerald-700 dark:text-emerald-400">
            Guía guardada
          </span>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { TextField, SelectField, TextareaField, MoneyField, SwitchField, Banner } from "@/components/admin/form/fields";
import { ManualOrderLineEditor } from "@/components/admin/orders/manual-order-line-editor";
import { formatMXN } from "@/lib/money";
import { pesosToCents } from "@/lib/money";
import { EMAIL_PATTERN } from "@/lib/config/checkout";
import { computeShipping } from "@/lib/cart/shipping";
import { createManualOrder } from "@/app/admin/(app)/orders/actions";
import {
  initialManualOrderFormState,
  type ManualOrderFormState,
  type ManualOrderFormValues,
  type ManualOrderLineValue,
} from "@/app/admin/(app)/orders/manual-order-form-state";
import type {
  ManualOrderField,
  ManualOrderFieldErrorKey,
} from "@/lib/admin/orders/manual-order-input";

interface ManualOrderFormProps {
  idempotencyKey: string;
  defaultShippingCents: number;
  flatRateCents: number | null;
  freeThresholdCents: number | null;
  stateOptions: readonly string[];
}

/** es-MX field-error copy, keyed by the pure validator's error key + field. */
const FIELD_ERROR_COPY: Record<ManualOrderFieldErrorKey, string> = {
  required: "Este campo es obligatorio.",
  "too-long": "El valor es demasiado largo.",
  "email-invalid": "Correo electrónico inválido.",
  "cp-invalid": "Ingresa un código postal de 5 dígitos.",
  "state-invalid": "Selecciona un estado.",
  "shipping-invalid": "Ingresa un costo de envío válido.",
  "no-items": "Agrega al menos un producto.",
  "line-invalid": "Revisa los artículos del pedido.",
};

/** The tab/focus order for `focusFirstInvalid`. */
const FIELD_ORDER: ManualOrderField[] = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "shipping_full_name",
  "address_line1",
  "address_line2",
  "city",
  "postal_code",
  "state",
  "shipping_override",
  "items",
];

/**
 * Manual / phone order create form (T17). `useActionState` island (mirrors
 * `ProductForm`): everything disabled while pending, values re-seed on reject,
 * banners re-key on `submissionId`, first-invalid focus, line issues attach to
 * the offending line. Success redirects server-side to the detail. es-MX only.
 */
export function ManualOrderForm({
  idempotencyKey,
  defaultShippingCents,
  flatRateCents,
  freeThresholdCents,
  stateOptions,
}: ManualOrderFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ManualOrderFormState, FormData>(
    createManualOrder,
    initialManualOrderFormState,
  );

  const values = state.values;
  const [lines, setLines] = useState<ManualOrderLineValue[]>(values?.lines ?? []);
  const [emailDraft, setEmailDraft] = useState(values?.contact_email ?? "");
  const [shippingTouched, setShippingTouched] = useState(false);
  const [shippingDraft, setShippingDraft] = useState(centsToInput(defaultShippingCents));

  // Re-seed the controlled draft state when the server echoes a NEW submission
  // (React's "store previous value in state + adjust during render" pattern —
  // no effect, no cascading render, no ref-in-render).
  const [seededSubmission, setSeededSubmission] = useState(state.submissionId);
  if (state.submissionId !== seededSubmission) {
    setSeededSubmission(state.submissionId);
    if (values) {
      setLines(values.lines);
      setEmailDraft(values.contact_email);
      setShippingDraft(values.shipping_override);
      setShippingTouched(true);
    }
  }

  useEffect(() => {
    if (state.status === "invalid" && state.fieldErrors) {
      focusFirstInvalid(formRef.current, state.fieldErrors);
    }
  }, [state.submissionId, state.status, state.fieldErrors]);

  const subtotalCents = useMemo(() => sumLines(lines, state.lineIssues), [lines, state.lineIssues]);
  const suggestedShippingCents = useMemo(
    () => computeSuggestedShipping(subtotalCents, flatRateCents, freeThresholdCents),
    [subtotalCents, flatRateCents, freeThresholdCents],
  );

  // Follow the store-suggested shipping until the admin edits the field — derived
  // at render time (no effect): the input shows the suggestion until touched.
  const effectiveShippingDraft = shippingTouched ? shippingDraft : centsToInput(suggestedShippingCents);
  const shippingCents = inputToCents(effectiveShippingDraft);
  const totalCents = subtotalCents + shippingCents;
  const emailValid = EMAIL_PATTERN.test(emailDraft.trim());

  const addLine = (line: ManualOrderLineValue): void =>
    setLines((current) => (current.some((existing) => existing.lineKey === line.lineKey) ? current : [...current, line]));
  const removeLine = (lineKey: string): void =>
    setLines((current) => current.filter((line) => line.lineKey !== lineKey));
  const changeQty = (lineKey: string, quantity: number): void =>
    setLines((current) => current.map((line) => (line.lineKey === lineKey ? { ...line, quantity } : line)));

  const err = (field: ManualOrderField): string | undefined => {
    const key = state.fieldErrors?.[field];
    return key ? FIELD_ERROR_COPY[key] : undefined;
  };
  const errorCount = state.fieldErrors ? Object.keys(state.fieldErrors).length : 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      data-testid="admin-manual-order-form"
      className="flex flex-col gap-6 pb-28 md:pb-6"
    >
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <div key={state.submissionId} className="contents">
        {state.status === "error" ? (
          <Banner role="alert" tone="error" icon={Alert02Icon} message="No se pudo crear el pedido. Intenta de nuevo." testid="manual-order-error" />
        ) : null}
        {state.status === "invalid" ? (
          <Banner role="alert" tone="error" icon={Alert02Icon} message={`Corrige ${errorCount} ${errorCount === 1 ? "campo" : "campos"}.`} testid="manual-order-invalid" />
        ) : null}
        {state.status === "lineIssues" ? (
          <Banner role="alert" tone="error" icon={Alert02Icon} message="Revisa los artículos marcados." testid="manual-order-line-issues" />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ClienteSection err={err} values={values} emailDraft={emailDraft} onEmailChange={setEmailDraft} disabled={pending} />
          <EnvioSection err={err} values={values} stateOptions={stateOptions} disabled={pending} />

          <Section title="Artículos">
            {err("items") ? (
              <p role="alert" className="text-xs text-destructive" data-testid="manual-order-items-error">
                {err("items")}
              </p>
            ) : null}
            <ManualOrderLineEditor
              lines={lines}
              issues={state.lineIssues ?? []}
              disabled={pending}
              onAdd={addLine}
              onRemove={removeLine}
              onQtyChange={changeQty}
            />
          </Section>

          <Section title="Pedido">
            <MoneyField
              name="shipping_override"
              label="Costo de envío"
              value={effectiveShippingDraft}
              onChange={(event) => {
                setShippingTouched(true);
                setShippingDraft(event.target.value);
              }}
              error={err("shipping_override")}
              disabled={pending}
              helper={`Sugerido por la tienda: ${formatMXN(suggestedShippingCents)}. Ajústalo si aplica.`}
              testid="manual-order-shipping"
            />
            <TextareaField
              name="internal_note"
              label="Nota interna"
              rows={3}
              defaultValue={values?.internal_note ?? ""}
              disabled={pending}
              helper="Solo visible para el equipo; no se envía al cliente."
              testid="manual-order-note"
            />
          </Section>

          <PagoSection values={values} emailValid={emailValid} disabled={pending} />
        </div>

        <OrderSummaryPanel subtotalCents={subtotalCents} shippingCents={shippingCents} totalCents={totalCents} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-border bg-background/80 px-4 py-3 backdrop-blur md:sticky md:bottom-auto md:top-0 md:-mx-6 md:border-b md:border-t-0 md:px-6">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push("/admin/orders")} data-testid="manual-order-cancel">
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={pending} data-testid="admin-manual-order-submit">
          {pending ? "Creando…" : "Crear pedido"}
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- sections -- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

interface SectionProps {
  err: (field: ManualOrderField) => string | undefined;
  values: ManualOrderFormValues | undefined;
  disabled: boolean;
}

function ClienteSection({ err, values, emailDraft, onEmailChange, disabled }: SectionProps & {
  emailDraft: string;
  onEmailChange: (value: string) => void;
}) {
  return (
    <Section title="Cliente">
      <TextField name="contact_name" label="Nombre de contacto" required defaultValue={values?.contact_name ?? ""} error={err("contact_name")} disabled={disabled} testid="manual-order-contact-name" />
      <TextField
        name="contact_email"
        type="email"
        label="Correo electrónico"
        value={emailDraft}
        onChange={(event) => onEmailChange(event.target.value)}
        error={err("contact_email")}
        disabled={disabled}
        helper="Opcional. Se usa para enviarle la confirmación y avisos; puedes dejarlo vacío en pedidos por teléfono."
        testid="manual-order-contact-email"
      />
      <TextField name="contact_phone" label="Teléfono" autoComplete="tel" defaultValue={values?.contact_phone ?? ""} error={err("contact_phone")} disabled={disabled} testid="manual-order-contact-phone" />
    </Section>
  );
}

function EnvioSection({ err, values, stateOptions, disabled }: SectionProps & { stateOptions: readonly string[] }) {
  const options = [{ value: "", label: "Selecciona…" }, ...stateOptions.map((state) => ({ value: state, label: state }))];
  return (
    <Section title="Envío">
      <TextField name="shipping_full_name" label="Nombre de quien recibe" required defaultValue={values?.shipping_full_name ?? ""} error={err("shipping_full_name")} disabled={disabled} testid="manual-order-ship-name" />
      <TextField name="address_line1" label="Calle y número" required defaultValue={values?.address_line1 ?? ""} error={err("address_line1")} disabled={disabled} testid="manual-order-address1" />
      <TextField name="address_line2" label="Interior / referencia" defaultValue={values?.address_line2 ?? ""} error={err("address_line2")} disabled={disabled} testid="manual-order-address2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="city" label="Ciudad" required defaultValue={values?.city ?? ""} error={err("city")} disabled={disabled} testid="manual-order-city" />
        <TextField name="postal_code" label="CP" required maxLength={5} defaultValue={values?.postal_code ?? ""} error={err("postal_code")} disabled={disabled} testid="manual-order-cp" />
      </div>
      <SelectField name="state" label="Estado" options={options} defaultValue={values?.state ?? ""} error={err("state")} disabled={disabled} testid="manual-order-state" />
      <TextField name="delivery_notes" label="Notas de entrega" defaultValue={values?.delivery_notes ?? ""} error={err("delivery_notes")} disabled={disabled} testid="manual-order-delivery-notes" />
      <TextField name="rfc" label="RFC (facturación)" defaultValue={values?.rfc ?? ""} error={err("rfc")} disabled={disabled} testid="manual-order-rfc" />
    </Section>
  );
}

function PagoSection({ values, emailValid, disabled }: {
  values: ManualOrderFormValues | undefined;
  emailValid: boolean;
  disabled: boolean;
}) {
  const [choice, setChoice] = useState<"pending" | "paid">(values?.payment_choice ?? "pending");
  return (
    <Section title="Pago">
      <div role="radiogroup" aria-label="Estado de pago" className="flex flex-col gap-2">
        <PaymentOption value="pending" label="Marcar pendiente de pago" helper="Cobra después o al entregar." checked={choice === "pending"} disabled={disabled} onSelect={setChoice} testid="manual-order-payment-pending" />
        <PaymentOption value="paid" label="Registrar pago recibido (offline)" helper="Se marca como pagado ahora mismo." checked={choice === "paid"} disabled={disabled} onSelect={setChoice} testid="manual-order-payment-paid" />
      </div>
      <SwitchField
        name="send_confirmation"
        label="Enviar correo de confirmación al cliente"
        defaultChecked={values?.send_confirmation ?? false}
        disabled={disabled || !emailValid}
        helper={emailValid ? "Se enviará solo si capturaste un correo válido." : "Agrega un correo válido para poder enviarlo."}
        testid="manual-order-confirm-email"
      />
    </Section>
  );
}

function PaymentOption({ value, label, helper, checked, disabled, onSelect, testid }: {
  value: "pending" | "paid";
  label: string;
  helper: string;
  checked: boolean;
  disabled: boolean;
  onSelect: (value: "pending" | "paid") => void;
  testid: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${checked ? "border-ring ring-2 ring-ring/30" : "border-border"} ${disabled ? "opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="payment_choice"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        data-testid={testid}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{helper}</span>
      </span>
    </label>
  );
}

function OrderSummaryPanel({ subtotalCents, shippingCents, totalCents }: {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}) {
  return (
    <aside className="lg:col-span-1">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 md:sticky md:top-16" data-testid="manual-order-summary">
        <h2 className="text-sm font-medium">Resumen</h2>
        <dl className="flex flex-col gap-1 text-sm">
          <SummaryRow label="Subtotal" value={formatMXN(subtotalCents)} />
          <SummaryRow label="Envío" value={formatMXN(shippingCents)} />
          <SummaryRow label="Total" value={formatMXN(totalCents)} emphasis />
        </dl>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "font-semibold tabular-nums text-foreground" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers -- */

/** Sum line totals, using the live (price-changed) price when an issue exists. */
function sumLines(lines: ManualOrderLineValue[], issues: ManualOrderFormState["lineIssues"]): number {
  return lines.reduce((sum, line) => {
    const issue = issues?.find((candidate) => candidate.lineKey === line.lineKey);
    const price =
      issue?.kind === "price-changed" && issue.liveUnitPriceCents !== undefined
        ? issue.liveUnitPriceCents
        : line.unitPriceCents;
    return sum + price * line.quantity;
  }, 0);
}

/** Compute the store-suggested shipping for the live subtotal (display only). */
function computeSuggestedShipping(
  subtotalCents: number,
  flatRateCents: number | null,
  freeThresholdCents: number | null,
): number {
  const shipping = computeShipping(subtotalCents, { flatRateCents, freeThresholdCents });
  return shipping.kind === "flat" ? shipping.cents : 0;
}

/** Convert integer cents to a MoneyField decimal string (e.g. 50000 → "500.00"). */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Convert a MoneyField decimal string to integer cents (0 on invalid). */
function inputToCents(value: string): number {
  const pesos = Number(value.trim());
  if (!Number.isFinite(pesos) || pesos < 0) {
    return 0;
  }
  const cents = pesosToCents(pesos);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : 0;
}

/** Focus the first invalid field by testid (mirrors the ProductForm helper). */
function focusFirstInvalid(
  form: HTMLFormElement | null,
  fieldErrors: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>,
): void {
  if (!form) {
    return;
  }
  for (const field of FIELD_ORDER) {
    if (fieldErrors[field]) {
      const testid = FIELD_TESTID[field];
      const element = testid ? form.querySelector<HTMLElement>(`[data-testid="${testid}"]`) : null;
      element?.focus();
      return;
    }
  }
}

/** Map a field to its input testid (for focus-on-invalid). */
const FIELD_TESTID: Partial<Record<ManualOrderField, string>> = {
  contact_name: "manual-order-contact-name",
  contact_email: "manual-order-contact-email",
  contact_phone: "manual-order-contact-phone",
  shipping_full_name: "manual-order-ship-name",
  address_line1: "manual-order-address1",
  address_line2: "manual-order-address2",
  city: "manual-order-city",
  postal_code: "manual-order-cp",
  state: "manual-order-state",
  shipping_override: "manual-order-shipping",
  items: "manual-order-search",
};

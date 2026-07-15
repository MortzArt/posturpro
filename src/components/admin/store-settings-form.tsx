"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { saveStoreSettings } from "@/app/admin/actions";
import {
  initialAdminSettingsState,
  type AdminSettingsState,
  type AdminSettingsValues,
} from "@/app/admin/admin-form-state";
import {
  STORE_NAME_MAX_LENGTH,
  type AdminSettingsField,
  type AdminSettingsFieldError,
} from "@/lib/admin/settings-input";
import { cn } from "@/lib/utils";

/**
 * StoreSettingsForm (T10 AC-8, AC-9, AC-10, edges 6/7/8) — the core admin surface.
 * `useActionState` wires the `saveStoreSettings` action. Fields arrive populated
 * from the SSR read (no skeleton — data is present at render). Money is edited in
 * PESOS with an `inputmode="decimal"` field + static `$` adornment (never
 * `type="number"` — avoids locale coercion/spinners); the server parser is the
 * boundary. On invalid: inline field errors + focus to first bad field, form
 * stays filled. On success: non-blocking banner (keyed replay), form stays
 * editable. Banners/errors reuse `.enter-fade` (RM-safe).
 */
interface StoreSettingsFormProps {
  initialValues: AdminSettingsValues;
  /** True when the store_settings row was absent → info banner + seeded defaults. */
  rowMissing: boolean;
}

const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:opacity-60";

/** Spanish copy for every field-error key (AC-10). */
const FIELD_ERROR_MESSAGES: Record<AdminSettingsFieldError, string> = {
  "name-required": "El nombre no puede estar vacío.",
  "name-too-long": `El nombre no puede superar ${STORE_NAME_MAX_LENGTH} caracteres.`,
  "email-required": "Ingresa un correo de contacto.",
  "email-invalid": "Ingresa un correo válido.",
  "money-required": "Ingresa un monto (usa 0 para gratis).",
  "money-invalid": "Usa punto decimal y sin separadores de miles, p. ej. 1500.00.",
  "money-negative": "El monto no puede ser negativo.",
  "money-too-many-decimals": "Usa máximo 2 decimales.",
  "money-overflow": "El monto es demasiado grande.",
};

export function StoreSettingsForm({ initialValues, rowMissing }: StoreSettingsFormProps) {
  const [state, formAction, pending] = useActionState<AdminSettingsState, FormData>(
    saveStoreSettings,
    initialAdminSettingsState,
  );

  const successRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const flatRef = useRef<HTMLInputElement>(null);
  const thresholdRef = useRef<HTMLInputElement>(null);

  // Focus the success banner after a save; focus the first invalid field otherwise.
  useEffect(() => {
    if (state.status === "success") {
      successRef.current?.focus();
    } else if (state.status === "invalid") {
      focusFirstInvalid(state.fieldErrors, { nameRef, emailRef, flatRef, thresholdRef });
    }
  }, [state.status, state.submissionId, state.fieldErrors]);

  // Values shown: preserved input on any post-back, else the SSR seed.
  const values = state.values ?? initialValues;

  return (
    <div className="flex flex-col gap-6">
      {state.status === "success" ? (
        <Banner
          key={state.submissionId}
          ref={successRef}
          role="status"
          testid="admin-settings-success"
          tone="info"
          icon={CheckmarkCircle02Icon}
          message="Configuración guardada."
        />
      ) : null}

      {rowMissing && state.status !== "success" ? (
        <Banner
          testid="admin-settings-row-missing"
          role="status"
          tone="info"
          icon={InformationCircleIcon}
          message="No se encontró la configuración de la tienda. Se muestran los valores predeterminados; guarda para crearla."
        />
      ) : null}

      <form action={formAction} noValidate className="flex flex-col gap-6" data-testid="admin-settings-form">
        <TextField
          ref={nameRef}
          name="store_name"
          label="Nombre de la tienda"
          type="text"
          maxLength={STORE_NAME_MAX_LENGTH}
          defaultValue={values.store_name}
          error={fieldError(state, "store_name")}
          disabled={pending}
          testid="admin-settings-name"
        />
        <TextField
          ref={emailRef}
          name="contact_email"
          label="Correo de contacto"
          type="email"
          defaultValue={values.contact_email}
          error={fieldError(state, "contact_email")}
          disabled={pending}
          testid="admin-settings-email"
        />
        <MoneyField
          ref={flatRef}
          name="shipping_flat_rate"
          label="Tarifa de envío (MXN)"
          helper="Se cobra por pedido. Usa 0 para envío gratis."
          defaultValue={values.shipping_flat_rate}
          error={fieldError(state, "shipping_flat_rate")}
          disabled={pending}
          testid="admin-settings-flat-rate"
        />
        <MoneyField
          ref={thresholdRef}
          name="free_shipping_threshold"
          label="Envío gratis a partir de (MXN)"
          helper="Usa 0 para ofrecer envío gratis siempre."
          defaultValue={values.free_shipping_threshold}
          error={fieldError(state, "free_shipping_threshold")}
          disabled={pending}
          testid="admin-settings-threshold"
        />

        {state.status === "error" ? (
          <Banner
            testid="admin-settings-error"
            role="alert"
            tone="error"
            icon={Alert02Icon}
            message="No se pudo guardar. Intenta de nuevo."
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          data-testid="admin-settings-submit"
          className="min-h-11 w-full px-4 sm:w-auto sm:self-end"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}

/** Resolve the localized message for a field's error, or null. */
function fieldError(state: AdminSettingsState, field: AdminSettingsField): string | null {
  const key = state.fieldErrors?.[field];
  return key ? FIELD_ERROR_MESSAGES[key] : null;
}

/** Move focus to the first field with an error (keyboard lands on it). */
function focusFirstInvalid(
  fieldErrors: AdminSettingsState["fieldErrors"],
  refs: {
    nameRef: React.RefObject<HTMLInputElement | null>;
    emailRef: React.RefObject<HTMLInputElement | null>;
    flatRef: React.RefObject<HTMLInputElement | null>;
    thresholdRef: React.RefObject<HTMLInputElement | null>;
  },
): void {
  if (fieldErrors?.store_name) {
    refs.nameRef.current?.focus();
  } else if (fieldErrors?.contact_email) {
    refs.emailRef.current?.focus();
  } else if (fieldErrors?.shipping_flat_rate) {
    refs.flatRef.current?.focus();
  } else if (fieldErrors?.free_shipping_threshold) {
    refs.thresholdRef.current?.focus();
  }
}

interface TextFieldProps {
  ref: React.Ref<HTMLInputElement>;
  name: string;
  label: string;
  type: "text" | "email";
  defaultValue: string;
  error: string | null;
  disabled: boolean;
  testid: string;
  maxLength?: number;
}

function TextField({
  ref,
  name,
  label,
  type,
  defaultValue,
  error,
  disabled,
  testid,
  maxLength,
}: TextFieldProps) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        maxLength={maxLength}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        data-testid={testid}
        className={fieldClasses}
      />
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

interface MoneyFieldProps {
  ref: React.Ref<HTMLInputElement>;
  name: string;
  label: string;
  helper: string;
  defaultValue: string;
  error: string | null;
  disabled: boolean;
  testid: string;
}

function MoneyField({
  ref,
  name,
  label,
  helper,
  defaultValue,
  error,
  disabled,
  testid,
}: MoneyFieldProps) {
  const id = useId();
  const errorId = useId();
  const helperId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-11 items-stretch rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          error && "border-destructive ring-2 ring-destructive/20",
          disabled && "opacity-60",
        )}
      >
        <span className="flex items-center border-r border-border px-3 text-sm text-muted-foreground" aria-hidden>
          $
        </span>
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(helperId, error ? errorId : undefined)}
          data-testid={testid}
          className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-foreground outline-none"
        />
      </div>
      <p id={helperId} className="text-xs text-muted-foreground">
        {helper}
      </p>
      {error ? <FieldError id={errorId} message={error} testid={`${testid}-error`} /> : null}
    </div>
  );
}

function FieldError({ id, message, testid }: { id: string; message: string; testid: string }) {
  return (
    <p id={id} role="alert" data-testid={testid} className="enter-fade flex items-center gap-1 text-xs text-destructive">
      <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
      {message}
    </p>
  );
}

interface BannerProps {
  ref?: React.Ref<HTMLDivElement>;
  role: "status" | "alert";
  tone: "info" | "error";
  icon: IconSvgElement;
  message: string;
  testid: string;
}

function Banner({ ref, role, tone, icon, message, testid }: BannerProps) {
  return (
    <div
      ref={ref}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      tabIndex={ref ? -1 : undefined}
      data-testid={testid}
      className={cn(
        "enter-fade flex items-start gap-2 rounded-md p-3 text-sm outline-none",
        tone === "error"
          ? "border border-destructive/30 bg-destructive/5 text-destructive"
          : "bg-muted/50 text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

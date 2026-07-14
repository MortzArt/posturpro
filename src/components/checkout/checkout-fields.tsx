"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckoutCard, TextField, FieldError, fieldClasses } from "@/components/checkout/checkout-field";
import { MEXICAN_STATES, CONTACT_PHONE_MAX, ADDRESS_FIELD_MAX, DELIVERY_NOTES_MAX, RFC_MAX } from "@/lib/config";
import type { AddressField, AddressFieldErrorKey } from "@/lib/checkout/address";
import type { CheckoutFormValues } from "@/app/[locale]/checkout/checkout-form-state";
import type { FocusableFieldElement } from "@/components/checkout/checkout-flow-client";
import { cn } from "@/lib/utils";

/**
 * The three checkout form sections (contact / shipping / delivery notes),
 * T7 AC-1, AC-4, AC-5. Values are pre-filled from the preserved `values` after a
 * failed submit; errors are localized keys resolved by the parent. The state
 * picker is the vendored shadcn `Select` with a controlled value mirrored into a
 * hidden `<input name="state">` so it reaches `FormData` (Radix Select does not
 * auto-submit in a plain form).
 */

export interface CheckoutFieldLabels {
  contact: { heading: string; email: string; emailPlaceholder: string; phone: string; phonePlaceholder: string };
  shipping: {
    heading: string;
    fullName: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    postalCode: string;
    postalCodePlaceholder: string;
    state: string;
    statePlaceholder: string;
  };
  notes: { heading: string; label: string; placeholder: string; rfc: string; rfcHint: string };
}

interface CheckoutFieldsProps {
  values: CheckoutFormValues | undefined;
  fieldErrors: Partial<Record<AddressField, AddressFieldErrorKey>> | undefined;
  resolveError: (key: AddressFieldErrorKey | undefined) => string | null;
  disabled: boolean;
  labels: CheckoutFieldLabels;
  /** The field to focus after a failed submit (first invalid in DOM order). */
  firstInvalidField: AddressField | null;
  /** Ref attached to whichever control matches {@link firstInvalidField}. */
  firstInvalidRef: React.Ref<FocusableFieldElement>;
}

export function CheckoutFields({
  values,
  fieldErrors,
  resolveError,
  disabled,
  labels,
  firstInvalidField,
  firstInvalidRef,
}: CheckoutFieldsProps) {
  /** The ref for `field` when it is the first invalid one, else undefined. */
  const refFor = (field: AddressField): React.Ref<HTMLInputElement> | undefined =>
    firstInvalidField === field ? (firstInvalidRef as React.Ref<HTMLInputElement>) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <CheckoutCard heading={labels.contact.heading}>
        <TextField
          id="checkout-email"
          name="email"
          label={labels.contact.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={disabled}
          defaultValue={values?.email}
          placeholder={labels.contact.emailPlaceholder}
          error={resolveError(fieldErrors?.email)}
          errorId="checkout-email-error"
          testId="checkout-email-input"
          inputRef={refFor("email")}
        />
        <TextField
          id="checkout-phone"
          name="contact_phone"
          label={labels.contact.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={CONTACT_PHONE_MAX}
          disabled={disabled}
          defaultValue={values?.contact_phone}
          placeholder={labels.contact.phonePlaceholder}
          error={resolveError(fieldErrors?.contact_phone)}
          errorId="checkout-phone-error"
          testId="checkout-phone-input"
          inputRef={refFor("contact_phone")}
        />
      </CheckoutCard>

      <ShippingSection
        values={values}
        fieldErrors={fieldErrors}
        resolveError={resolveError}
        disabled={disabled}
        labels={labels.shipping}
        refFor={refFor}
        stateRef={firstInvalidField === "state" ? (firstInvalidRef as React.Ref<HTMLButtonElement>) : undefined}
      />

      <NotesSection values={values} disabled={disabled} labels={labels.notes} />
    </div>
  );
}

function ShippingSection({
  values,
  fieldErrors,
  resolveError,
  disabled,
  labels,
  refFor,
  stateRef,
}: {
  values: CheckoutFormValues | undefined;
  fieldErrors: Partial<Record<AddressField, AddressFieldErrorKey>> | undefined;
  resolveError: (key: AddressFieldErrorKey | undefined) => string | null;
  disabled: boolean;
  labels: CheckoutFieldLabels["shipping"];
  refFor: (field: AddressField) => React.Ref<HTMLInputElement> | undefined;
  stateRef: React.Ref<HTMLButtonElement> | undefined;
}) {
  const stateError = resolveError(fieldErrors?.state);
  return (
    <CheckoutCard heading={labels.heading}>
      <TextField id="checkout-fullname" name="shipping_full_name" label={labels.fullName}
        autoComplete="name" required maxLength={ADDRESS_FIELD_MAX} disabled={disabled}
        defaultValue={values?.shipping_full_name}
        error={resolveError(fieldErrors?.shipping_full_name)} errorId="checkout-fullname-error"
        testId="checkout-fullname-input" inputRef={refFor("shipping_full_name")} />
      <TextField id="checkout-address1" name="address_line1" label={labels.addressLine1}
        autoComplete="address-line1" required maxLength={ADDRESS_FIELD_MAX} disabled={disabled}
        defaultValue={values?.address_line1}
        error={resolveError(fieldErrors?.address_line1)} errorId="checkout-address1-error"
        testId="checkout-address1-input" inputRef={refFor("address_line1")} />
      <TextField id="checkout-address2" name="address_line2" label={labels.addressLine2}
        autoComplete="address-line2" maxLength={ADDRESS_FIELD_MAX} disabled={disabled}
        defaultValue={values?.address_line2}
        error={resolveError(fieldErrors?.address_line2)} errorId="checkout-address2-error"
        testId="checkout-address2-input" inputRef={refFor("address_line2")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField id="checkout-city" name="city" label={labels.city}
          autoComplete="address-level2" required maxLength={ADDRESS_FIELD_MAX} disabled={disabled}
          defaultValue={values?.city}
          error={resolveError(fieldErrors?.city)} errorId="checkout-city-error"
          testId="checkout-city-input" inputRef={refFor("city")} />
        <TextField id="checkout-cp" name="postal_code" label={labels.postalCode}
          inputMode="numeric" autoComplete="postal-code" maxLength={5} required disabled={disabled}
          defaultValue={values?.postal_code} placeholder={labels.postalCodePlaceholder}
          error={resolveError(fieldErrors?.postal_code)} errorId="checkout-cp-error"
          testId="checkout-cp-input" inputRef={refFor("postal_code")} />
      </div>
      <StateField
        defaultValue={values?.state}
        error={stateError}
        disabled={disabled}
        label={labels.state}
        placeholder={labels.statePlaceholder}
        triggerRef={stateRef}
      />
    </CheckoutCard>
  );
}

function StateField({
  defaultValue,
  error,
  disabled,
  label,
  placeholder,
  triggerRef,
}: {
  defaultValue: string | undefined;
  error: string | null;
  disabled: boolean;
  label: string;
  placeholder: string;
  triggerRef: React.Ref<HTMLButtonElement> | undefined;
}) {
  const [state, setState] = useState(defaultValue ?? "");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="checkout-state" className="text-sm font-medium text-foreground">
        {label}
      </label>
      {/* Controlled Radix Select + hidden input so `state` reaches FormData. */}
      <input type="hidden" name="state" value={state} />
      <Select value={state || undefined} onValueChange={setState} disabled={disabled}>
        <SelectTrigger
          ref={triggerRef}
          id="checkout-state"
          className="h-11 w-full"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "checkout-state-error" : undefined}
          data-testid="checkout-state"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {MEXICAN_STATES.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError id="checkout-state-error" message={error} /> : null}
    </div>
  );
}

function NotesSection({
  values,
  disabled,
  labels,
}: {
  values: CheckoutFormValues | undefined;
  disabled: boolean;
  labels: CheckoutFieldLabels["notes"];
}) {
  return (
    <CheckoutCard heading={labels.heading}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="checkout-notes" className="text-sm font-medium text-foreground">
          {labels.label}
        </label>
        <textarea
          id="checkout-notes"
          name="delivery_notes"
          maxLength={DELIVERY_NOTES_MAX}
          disabled={disabled}
          defaultValue={values?.delivery_notes}
          placeholder={labels.placeholder}
          data-testid="checkout-notes-input"
          className={cn(fieldClasses, "min-h-24 resize-y")}
        />
      </div>
      <TextField
        id="checkout-rfc"
        name="rfc"
        label={labels.rfc}
        autoCapitalize="characters"
        maxLength={RFC_MAX}
        disabled={disabled}
        defaultValue={values?.rfc}
        testId="checkout-rfc-input"
      />
      <p className="text-xs text-muted-foreground">{labels.rfcHint}</p>
    </CheckoutCard>
  );
}

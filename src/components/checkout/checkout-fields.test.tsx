/**
 * CheckoutFields render + a11y tests (T7 AC-4, AC-5; Stage-6 MAJOR regression
 * locks M-1, M-4, M-5, m-7). These are the exact defects the review found and
 * fix closed, so they get explicit tests so a refactor can never silently
 * regress them:
 *   - M-1: every field's error id is `checkout-<field>-error` (DISTINCT from the
 *     input id) so `aria-describedby` resolves to the <p>, not the input itself,
 *     and there are no duplicate DOM ids.
 *   - M-4: the first invalid field IN DOM ORDER receives the focus ref (incl. the
 *     state Select trigger), not just email.
 *   - M-5: the delivery-notes textarea has an associated <label>.
 *   - m-7: the phone field uses inputMode="tel" (a leading + is typeable).
 */
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CheckoutFields, type CheckoutFieldLabels } from "./checkout-fields";
import type { FocusableFieldElement } from "./checkout-flow-client";
import type { AddressField, AddressFieldErrorKey } from "@/lib/checkout/address";
import type { CheckoutFormValues } from "@/app/[locale]/checkout/checkout-form-state";

const labels: CheckoutFieldLabels = {
  contact: {
    heading: "Contacto",
    email: "Correo electrónico",
    emailPlaceholder: "tucorreo@ejemplo.com",
    phone: "Teléfono",
    phonePlaceholder: "55 1234 5678",
  },
  shipping: {
    heading: "Dirección de envío",
    fullName: "Nombre completo",
    addressLine1: "Calle y número",
    addressLine2: "Interior / referencias",
    city: "Ciudad",
    postalCode: "Código postal",
    postalCodePlaceholder: "06700",
    state: "Estado",
    statePlaceholder: "Selecciona un estado",
  },
  notes: {
    heading: "Notas",
    label: "Notas de entrega",
    placeholder: "Instrucciones para la entrega",
    rfc: "RFC (opcional)",
    rfcHint: "Para facturación (Fase 3).",
  },
};

/** A localized error message keyed by field-error key (identity for testing). */
function resolveError(key: AddressFieldErrorKey | undefined): string | null {
  return key ? `ERR:${key}` : null;
}

interface RenderOptions {
  values?: CheckoutFormValues;
  fieldErrors?: Partial<Record<AddressField, AddressFieldErrorKey>>;
  firstInvalidField?: AddressField | null;
  firstInvalidRef?: React.Ref<FocusableFieldElement>;
  disabled?: boolean;
}

function renderFields({
  values,
  fieldErrors,
  firstInvalidField = null,
  firstInvalidRef = createRef<FocusableFieldElement>(),
  disabled = false,
}: RenderOptions = {}) {
  return render(
    <CheckoutFields
      values={values}
      fieldErrors={fieldErrors}
      resolveError={resolveError}
      disabled={disabled}
      labels={labels}
      firstInvalidField={firstInvalidField}
      firstInvalidRef={firstInvalidRef}
    />,
  );
}

describe("CheckoutFields — rendering & labels (AC-5)", () => {
  afterEach(cleanup);

  it("renders every contact + shipping input with a visible label", () => {
    renderFields();
    for (const testid of [
      "checkout-email-input",
      "checkout-phone-input",
      "checkout-fullname-input",
      "checkout-address1-input",
      "checkout-address2-input",
      "checkout-city-input",
      "checkout-cp-input",
      "checkout-notes-input",
      "checkout-rfc-input",
    ]) {
      expect(screen.getByTestId(testid)).toBeInTheDocument();
    }
  });

  it("associates a <label> with the delivery-notes textarea (M-5)", () => {
    renderFields();
    // getByLabelText resolves the accessible name via <label htmlFor>.
    const notes = screen.getByLabelText("Notas de entrega");
    expect(notes).toBe(screen.getByTestId("checkout-notes-input"));
    expect(notes.tagName).toBe("TEXTAREA");
  });

  it("pre-fills inputs from preserved values after a failed submit", () => {
    renderFields({
      values: {
        email: "keep@me.com",
        contact_phone: "5511112222",
        shipping_full_name: "Ada Lovelace",
        address_line1: "Calle 1",
        address_line2: "",
        city: "CDMX",
        postal_code: "06700",
        state: "Ciudad de México",
        delivery_notes: "",
        rfc: "",
        discountCode: "",
      },
    });
    expect(screen.getByTestId("checkout-email-input")).toHaveValue("keep@me.com");
    expect(screen.getByTestId("checkout-fullname-input")).toHaveValue("Ada Lovelace");
  });

  it("uses inputMode=tel on the phone field so a leading + is typeable (m-7)", () => {
    renderFields();
    expect(screen.getByTestId("checkout-phone-input")).toHaveAttribute("inputmode", "tel");
  });

  it("uses inputMode=numeric + maxLength 5 on the CP field (AC-4)", () => {
    renderFields();
    const cp = screen.getByTestId("checkout-cp-input");
    expect(cp).toHaveAttribute("inputmode", "numeric");
    expect(cp).toHaveAttribute("maxlength", "5");
  });
});

describe("CheckoutFields — field-error a11y wiring (M-1)", () => {
  afterEach(cleanup);

  it("gives each errored field a DISTINCT error id (not equal to the input id)", () => {
    renderFields({ fieldErrors: { email: "emailInvalid", postal_code: "postalCodeInvalid" } });

    const email = screen.getByTestId("checkout-email-input");
    const emailError = screen.getByTestId("checkout-email-error-error");
    // aria-describedby points at the <p> error, whose id differs from the input id.
    expect(email.getAttribute("aria-describedby")).toBe("checkout-email-error");
    expect(email.id).not.toBe("checkout-email-error");
    expect(emailError.id).toBe("checkout-email-error");
    expect(email).toHaveAttribute("aria-invalid", "true");

    const cp = screen.getByTestId("checkout-cp-input");
    expect(cp.getAttribute("aria-describedby")).toBe("checkout-cp-error");
  });

  it("does not set aria-describedby on fields without an error", () => {
    renderFields({ fieldErrors: { email: "emailInvalid" } });
    expect(screen.getByTestId("checkout-city-input")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByTestId("checkout-city-input")).not.toHaveAttribute("aria-invalid");
  });

  it("wires the state Select trigger to its own error id when the state is invalid", () => {
    renderFields({ fieldErrors: { state: "stateRequired" } });
    const trigger = screen.getByTestId("checkout-state");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger.getAttribute("aria-describedby")).toBe("checkout-state-error");
    expect(screen.getByTestId("checkout-state-error-error")).toBeInTheDocument();
  });

  it("renders the resolved (localized) error text under the field", () => {
    renderFields({ fieldErrors: { email: "emailRequired" } });
    expect(screen.getByTestId("checkout-email-error-error")).toHaveTextContent("ERR:emailRequired");
  });
});

describe("CheckoutFields — focus-first-invalid ref plumbing (M-4)", () => {
  afterEach(cleanup);

  it("attaches the focus ref to an input field when it is the first invalid", () => {
    const ref = createRef<FocusableFieldElement>();
    renderFields({
      fieldErrors: { postal_code: "postalCodeInvalid" },
      firstInvalidField: "postal_code",
      firstInvalidRef: ref,
    });
    expect(ref.current).toBe(screen.getByTestId("checkout-cp-input"));
  });

  it("attaches the focus ref to the state Select TRIGGER when state is first invalid", () => {
    const ref = createRef<FocusableFieldElement>();
    renderFields({
      fieldErrors: { state: "stateRequired" },
      firstInvalidField: "state",
      firstInvalidRef: ref,
    });
    // The trigger is a <button>; it can receive programmatic focus (M-4 fix).
    expect(ref.current).toBe(screen.getByTestId("checkout-state"));
    expect((ref.current as HTMLElement).tagName).toBe("BUTTON");
  });

  it("does not attach the ref to a field that is not the first invalid", () => {
    const ref = createRef<FocusableFieldElement>();
    renderFields({
      fieldErrors: { email: "emailInvalid", city: "cityRequired" },
      firstInvalidField: "email",
      firstInvalidRef: ref,
    });
    expect(ref.current).toBe(screen.getByTestId("checkout-email-input"));
    expect(ref.current).not.toBe(screen.getByTestId("checkout-city-input"));
  });
});

describe("CheckoutFields — disabled state (submitting)", () => {
  afterEach(cleanup);
  it("disables every field while the form is pending", () => {
    renderFields({ disabled: true });
    expect(screen.getByTestId("checkout-email-input")).toBeDisabled();
    expect(screen.getByTestId("checkout-notes-input")).toBeDisabled();
    expect(screen.getByTestId("checkout-state")).toBeDisabled();
  });
});

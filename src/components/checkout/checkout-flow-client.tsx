"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { CheckoutEmptyState } from "@/components/checkout/checkout-empty-state";
import { CheckoutFields } from "@/components/checkout/checkout-fields";
import { CheckoutSummary } from "@/components/checkout/checkout-summary";
import { CheckoutSkeleton } from "@/components/checkout/checkout-skeleton";
import { StickyCheckoutBar } from "@/components/checkout/sticky-checkout-bar";
import { placeOrder } from "@/app/[locale]/checkout/actions";
import {
  initialCheckoutFormState,
  type CheckoutFormState,
} from "@/app/[locale]/checkout/checkout-form-state";
import { CART_PATH, CATALOG_PATH, confirmationPath } from "@/lib/config";
import { computeShipping, totalCents } from "@/lib/cart/shipping";
import { subtotalCents } from "@/lib/cart/cart-line";
import { interpolate } from "@/lib/interpolate";
import { useCheckoutLabels } from "@/components/checkout/use-checkout-labels";
import { buildSummaryLines, buildSnapshotPrices, buildLinesPayload } from "@/components/checkout/checkout-helpers";
import { cn } from "@/lib/utils";

/**
 * CheckoutFlowClient (T7) — the whole checkout body. Reads `useCart()`, drives
 * `useActionState(placeOrder, …)`, renders skeleton / empty / form+summary and
 * every state; redirects to the confirmation on success (the confirmation page
 * clears the cart). One `<form>`, one action (the Q&A precedent). Store-settings
 * cents arrive as props (null → shipping "unavailable" → submit blocked, edge 5).
 */

interface CheckoutFlowClientProps {
  flatRateCents: number | null;
  freeThresholdCents: number | null;
}

export function CheckoutFlowClient({ flatRateCents, freeThresholdCents }: CheckoutFlowClientProps) {
  const t = useTranslations("checkout");
  const { lines, hydrated } = useCart();
  const [state, formAction, pending] = useActionState<CheckoutFormState, FormData>(
    placeOrder,
    initialCheckoutFormState,
  );

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 lg:px-8">
      {!hydrated ? (
        <CheckoutSkeleton title={t("title")} />
      ) : lines.length === 0 && state.status !== "success" ? (
        <>
          <BackLink label={t("backToCart")} />
          <PageHeading title={t("title")} />
          <CheckoutEmptyState
            browseHref={CATALOG_PATH}
            labels={{ title: t("empty.title"), subtitle: t("empty.subtitle"), cta: t("empty.cta") }}
          />
        </>
      ) : (
        <CheckoutBody
          flatRateCents={flatRateCents}
          freeThresholdCents={freeThresholdCents}
          state={state}
          formAction={formAction}
          pending={pending}
        />
      )}
    </div>
  );
}

interface CheckoutBodyProps {
  flatRateCents: number | null;
  freeThresholdCents: number | null;
  state: CheckoutFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

function CheckoutBody({ flatRateCents, freeThresholdCents, state, formAction, pending }: CheckoutBodyProps) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const { lines } = useCart();
  const labels = useCheckoutLabels();
  const emailRef = useRef<HTMLInputElement>(null);
  const [discountCode, setDiscountCode] = useState(state.values?.discountCode ?? "");
  const idempotencyKey = useIdempotencyKey(state.submissionId);

  // On success, redirect to the confirmation (which clears the cart on mount).
  useEffect(() => {
    if (state.status === "success" && state.orderNumber) {
      router.replace(confirmationPath(state.orderNumber));
    }
  }, [state.status, state.orderNumber, state.submissionId, router]);

  // Focus the first invalid field so a keyboard user lands on the error.
  useEffect(() => {
    if (state.status === "invalid" && state.fieldErrors?.email) {
      emailRef.current?.focus();
    }
  }, [state.status, state.fieldErrors, state.submissionId]);

  const subtotal = subtotalCents(lines);
  const shipping = computeShipping(subtotal, { flatRateCents, freeThresholdCents });
  const discountCents = state.discount?.kind === "applied" ? state.discount.discountCents : 0;
  const total = Math.max(0, totalCents(subtotal, shipping) - discountCents);
  const submitDisabled = pending || shipping.kind === "unavailable";
  const banner = resolveBanner(state, labels.banner);
  const summaryLines = buildSummaryLines(lines);
  const liveMessage = resolveLiveMessage(state, pending, t);

  return (
    <>
      <BackLink label={t("backToCart")} />
      <PageHeading title={t("title")} />
      <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="checkout-live-region">
        {liveMessage}
      </p>

      <form action={formAction} noValidate data-testid="checkout-form">
        <SerializedCartInputs lines={lines} idempotencyKey={idempotencyKey} />

        <div
          className={cn("grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr] lg:gap-10", pending ? "grid-pending" : "grid-idle")}
          aria-busy={pending}
        >
          <CheckoutFields
            values={state.values}
            fieldErrors={state.fieldErrors}
            resolveError={labels.resolveValidation}
            disabled={pending}
            labels={labels.fields}
            firstInvalidField={state.fieldErrors?.email ? "email" : null}
            emailRef={emailRef}
          />

          <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            {banner ? <GlobalBanner message={banner} testId="checkout-banner" /> : null}
            <CheckoutSummary
              lines={summaryLines}
              subtotalCents={subtotal}
              shipping={shipping}
              discountCents={discountCents}
              totalCents={total}
              submitDisabled={submitDisabled}
              pending={pending}
              discount={state.discount ?? { kind: "none" }}
              discountCodeValue={discountCode}
              onDiscountCodeChange={setDiscountCode}
              lineIssues={state.lineErrors}
              liveUnitPrices={state.liveUnitPrices}
              labels={labels.summary}
              showSubmit
            />
          </div>
        </div>

        <StickyCheckoutBar
          totalCents={total}
          submitDisabled={submitDisabled}
          pending={pending}
          submitLabel={labels.summary.submit}
          submittingLabel={labels.summary.submitting}
        />
      </form>
    </>
  );
}

/** Hidden inputs carrying the cart snapshot + idempotency key into the submit. */
function SerializedCartInputs({
  lines,
  idempotencyKey,
}: {
  lines: ReturnType<typeof useCart>["lines"];
  idempotencyKey: string;
}) {
  const linesJson = useMemo(() => JSON.stringify(buildLinesPayload(lines)), [lines]);
  const snapshotJson = useMemo(() => JSON.stringify(buildSnapshotPrices(lines)), [lines]);
  return (
    <>
      <input type="hidden" name="lines" value={linesJson} />
      <input type="hidden" name="snapshotPrices" value={snapshotJson} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </>
  );
}

/** A stable idempotency key per submission attempt (AC-14, edge 7). */
function useIdempotencyKey(submissionId: number): string {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const lastSubmission = useRef(submissionId);
  useEffect(() => {
    // A new submissionId means the previous attempt resolved (failure); mint a
    // fresh key so a corrected resubmit is a genuinely new order. A double-click
    // within one attempt reuses the same key (the DB unique index dedupes).
    if (submissionId !== lastSubmission.current) {
      lastSubmission.current = submissionId;
      setKey(crypto.randomUUID());
    }
  }, [submissionId]);
  return key;
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href={CART_PATH}
      data-testid="checkout-back-link"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden />
      {label}
    </Link>
  );
}

function PageHeading({ title }: { title: string }) {
  return (
    <h1
      className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
      data-testid="checkout-heading"
    >
      {title}
    </h1>
  );
}

function GlobalBanner({ message, testId }: { message: string; testId: string }) {
  return (
    <p role="alert" data-testid={testId} className="enter-fade flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

/** Map a non-field status to its global banner copy (or null). */
function resolveBanner(
  state: CheckoutFormState,
  banner: { priceChanged: string; outOfStock: string; shippingUnavailable: string; error: string },
): string | null {
  switch (state.status) {
    case "price-changed":
      return banner.priceChanged;
    case "out-of-stock":
      return banner.outOfStock;
    case "shipping-unavailable":
      return banner.shippingUnavailable;
    case "error":
      return banner.error;
    default:
      return null;
  }
}

/** The aria-live announcement for the current state. */
function resolveLiveMessage(
  state: CheckoutFormState,
  pending: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  if (pending) {
    return t("liveRegion.processing");
  }
  if (state.status === "success") {
    return t("liveRegion.orderReceived");
  }
  if (state.discount?.kind === "applied") {
    return interpolate(t.raw("liveRegion.discountApplied"), { amount: "" });
  }
  if (state.discount?.kind === "invalid") {
    return t("liveRegion.discountInvalid");
  }
  return "";
}

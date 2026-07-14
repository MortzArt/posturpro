"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, ArrowLeft01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
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
import type { AddressField } from "@/lib/checkout/address";
import { CART_PATH, CATALOG_PATH, confirmationPath } from "@/lib/config";
import { computeShipping, totalCents } from "@/lib/cart/shipping";
import { subtotalCents } from "@/lib/cart/cart-line";
import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import { useCheckoutLabels } from "@/components/checkout/use-checkout-labels";
import { buildSummaryLines, buildSnapshotPrices, buildLinesPayload, applyLivePrices } from "@/components/checkout/checkout-helpers";
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

/** A field control that can receive programmatic focus (input or Select trigger). */
export type FocusableFieldElement = HTMLInputElement | HTMLButtonElement;

/**
 * The blocking address/contact fields in the order they render (DOM order), so
 * "focus the first invalid field" lands a keyboard/AT user on the topmost error
 * rather than always on `email`. Optional/unrendered-error fields are omitted.
 */
const FOCUSABLE_FIELD_ORDER: readonly AddressField[] = [
  "email",
  "contact_phone",
  "shipping_full_name",
  "address_line1",
  "address_line2",
  "city",
  "postal_code",
  "state",
];

/** The first field (in DOM order) that has an error, or null. */
function firstInvalidFieldInDomOrder(
  fieldErrors: CheckoutFormState["fieldErrors"],
): AddressField | null {
  if (!fieldErrors) {
    return null;
  }
  return FOCUSABLE_FIELD_ORDER.find((field) => fieldErrors[field] !== undefined) ?? null;
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
  const firstInvalidRef = useRef<FocusableFieldElement>(null);
  const [discountCode, setDiscountCode] = useState(state.values?.discountCode ?? "");
  const idempotencyKey = useIdempotencyKey(state.submissionId);
  const firstInvalidField =
    state.status === "invalid" ? firstInvalidFieldInDomOrder(state.fieldErrors) : null;

  // On success, redirect to the confirmation (which clears the cart on mount).
  useEffect(() => {
    if (state.status === "success" && state.confirmationToken) {
      router.replace(confirmationPath(state.confirmationToken));
    }
  }, [state.status, state.confirmationToken, state.submissionId, router]);

  // Focus the first invalid field (in DOM order) so a keyboard/AT user lands on
  // the error — email, phone, name, address, city, CP, or the state trigger.
  useEffect(() => {
    if (state.status === "invalid" && firstInvalidField) {
      firstInvalidRef.current?.focus();
    }
  }, [state.status, state.submissionId, firstInvalidField]);

  // On price drift the server returns the LIVE unit prices and blocks the submit
  // (edge 1). Refresh the displayed lines + totals to those live prices so the
  // numbers match the per-line "price changed" note (display only; the server
  // stays authoritative). Every other state renders the cart snapshot.
  const snapshotLines = buildSummaryLines(lines);
  const { lines: summaryLines, subtotalCents: subtotal } =
    state.status === "price-changed"
      ? applyLivePrices(snapshotLines, state.liveUnitPrices)
      : { lines: snapshotLines, subtotalCents: subtotalCents(lines) };
  const shipping = computeShipping(subtotal, { flatRateCents, freeThresholdCents });
  const discountCents = state.discount?.kind === "applied" ? state.discount.discountCents : 0;
  const total = Math.max(0, totalCents(subtotal, shipping) - discountCents);
  const submitDisabled = pending || shipping.kind === "unavailable";
  const banner = resolveBanner(state, labels.banner);
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
            firstInvalidField={firstInvalidField}
            firstInvalidRef={firstInvalidRef}
          />

          <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            {banner ? (
              <GlobalBanner
                message={banner.message}
                recovery={banner.recovery}
                pending={pending}
                testId="checkout-banner"
              />
            ) : null}
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

/**
 * A recovery action offered inside the global-error banner (UX-Requirements:
 * "a recovery action — retry / review your cart"):
 * - `retry`   → a `type="submit"` button that re-runs `placeOrder` (right for a
 *   transient failure: a network/DB error or shipping temporarily unreadable).
 * - `review`  → a Link back to the cart (right when the user must actually change
 *   something first — a price changed or an item sold out; resubmitting the same
 *   order would just fail again).
 */
export type BannerRecovery =
  | { kind: "retry"; label: string }
  | { kind: "review"; label: string; href: string };

interface ResolvedBanner {
  message: string;
  recovery: BannerRecovery;
}

/** Exported for unit testing the recovery-action rendering (UX-Requirements). */
export function GlobalBanner({
  message,
  recovery,
  pending,
  testId,
}: {
  message: string;
  recovery: BannerRecovery;
  pending: boolean;
  testId: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="enter-fade flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <p className="flex items-start gap-2">
        <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
        {message}
      </p>
      <div className="pl-6">
        {recovery.kind === "retry" ? (
          <button
            type="submit"
            disabled={pending}
            data-testid="checkout-banner-action"
            className="cart-step-press inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} strokeWidth={2} aria-hidden />
            {recovery.label}
          </button>
        ) : (
          <Link
            href={recovery.href}
            data-testid="checkout-banner-action"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "cart-step-press h-8 gap-1.5 border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/10",
            )}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={2} aria-hidden />
            {recovery.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Map a non-field status to its global banner copy + recovery action (or null). */
function resolveBanner(
  state: CheckoutFormState,
  banner: {
    priceChanged: string;
    outOfStock: string;
    shippingUnavailable: string;
    error: string;
    retry: string;
    review: string;
  },
): ResolvedBanner | null {
  switch (state.status) {
    case "price-changed":
      return { message: banner.priceChanged, recovery: { kind: "review", label: banner.review, href: CART_PATH } };
    case "out-of-stock":
      return { message: banner.outOfStock, recovery: { kind: "review", label: banner.review, href: CART_PATH } };
    case "shipping-unavailable":
      return { message: banner.shippingUnavailable, recovery: { kind: "retry", label: banner.retry } };
    case "error":
      return { message: banner.error, recovery: { kind: "retry", label: banner.retry } };
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
    return interpolate(t.raw("liveRegion.discountApplied"), {
      amount: formatMXN(state.discount.discountCents),
    });
  }
  if (state.discount?.kind === "invalid") {
    return t("liveRegion.discountInvalid");
  }
  return "";
}

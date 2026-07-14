/**
 * The single source of the Mercado Pago SDK client (T8 AC-2).
 *
 * `import "server-only"` GUARANTEES the access token can never enter a client
 * bundle: importing this module (transitively) from a `"use client"` component
 * is a BUILD ERROR. Every privileged MP call — preference creation, payment
 * fetch, refunds — constructs its resource from the client built here, so the
 * secret is read in exactly one place.
 */
import "server-only";
import {
  MercadoPagoConfig,
  Payment,
  Preference,
  PaymentRefund,
} from "mercadopago";
import { getMercadoPagoEnv } from "@/lib/env";
import { MP_API_TIMEOUT_MS } from "@/lib/payments/config";

/**
 * Build a configured MP SDK client from the server-only access token, with a
 * bounded request timeout (preference creation is user-blocking; the webhook
 * must respond quickly). Throws `MissingEnvVarError` if the token is absent —
 * callers map that to a friendly "payment unavailable" state (edge 11).
 */
export function createMercadoPagoClient(): MercadoPagoConfig {
  const { accessToken } = getMercadoPagoEnv();
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: MP_API_TIMEOUT_MS },
  });
}

/** A `Preference` resource bound to a fresh client. */
export function preferenceClient(): Preference {
  return new Preference(createMercadoPagoClient());
}

/** A `Payment` resource bound to a fresh client (webhook status fetch). */
export function paymentClient(): Payment {
  return new Payment(createMercadoPagoClient());
}

/** A `PaymentRefund` resource bound to a fresh client (refund execution). */
export function refundClient(): PaymentRefund {
  return new PaymentRefund(createMercadoPagoClient());
}

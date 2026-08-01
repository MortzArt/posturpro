/**
 * Packing-slip ROUTE handler tests (T12 AC-22/29, edge 8). This route handler is
 * NOT covered by the middleware matcher (excludes /api-shaped handlers) nor the
 * (app) layout guard, so it MUST self-guard. The trust boundary is automated here,
 * not only exercised live:
 *   - unauthenticated → 401, WITHOUT reading any order (no PII leak).
 *   - authenticated + non-UUID / missing id → 404.
 *   - authenticated + real order → 200 text/html, no-store, with the slip body.
 *   - a cancelled order still self-guards AND shows the CANCELADO band (edge 8).
 *   - a thrown read → 500 with a friendly message (never the raw error).
 * `hasValidAdminSession` + `getAdminOrder` are mocked; the REAL
 * `buildPackingSlipHtml` runs so the response body contract is genuine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderDetail } from "@/lib/admin/orders/order-read";

vi.mock("server-only", () => ({}));

const hasValidAdminSession = vi.fn();
vi.mock("@/lib/admin/session-guard", () => ({
  hasValidAdminSession: () => hasValidAdminSession(),
}));

const getAdminOrder = vi.fn();
vi.mock("@/lib/admin/orders/order-read", () => ({
  getAdminOrder: (...args: unknown[]) => getAdminOrder(...args),
}));

import { GET } from "./route";

const ORDER_ID = "44444444-4444-4444-4444-444444444444";

function order(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    id: ORDER_ID,
    orderNumber: "PP-000777",
    contactEmail: "c@example.com",
    contactPhone: null,
    shippingFullName: "Ana",
    addressLine1: "Calle 1",
    addressLine2: null,
    city: "CDMX",
    state: "CDMX",
    postalCode: "06700",
    country: "MX",
    deliveryNotes: null,
    rfc: null,
    subtotalCents: 1000,
    shippingCents: 0,
    discountCents: 0,
    totalCents: 1000,
    orderStatus: "paid",
    paymentStatus: "paid",
    paymentMethod: "card",
    mpPaymentId: "MP-1",
    trackingNumber: null,
    trackingCarrier: null,
    trackingUrl: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    refundedCents: 0,
    items: [
      { id: "i1", productName: "P", productSku: "SKU-1", variantLabel: null, quantity: 1, unitPriceCents: 1000, lineTotalCents: 1000 },
    ],
    history: null,
    notes: null,
    ...overrides,
  };
}

function req(): Request {
  return new Request(`http://localhost/admin/orders/${ORDER_ID}/packing-slip`);
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  hasValidAdminSession.mockReset();
  getAdminOrder.mockReset();
});

describe("GET packing-slip — self-guard (AC-29)", () => {
  it("returns 401 and reads NO order when unauthenticated", async () => {
    hasValidAdminSession.mockResolvedValue(false);
    const res = await GET(req(), ctx(ORDER_ID));
    expect(res.status).toBe(401);
    expect(getAdminOrder).not.toHaveBeenCalled();
  });
});

describe("GET packing-slip — id resolution (AC-22, edge)", () => {
  it("returns 404 for a missing / non-existent order", async () => {
    hasValidAdminSession.mockResolvedValue(true);
    getAdminOrder.mockResolvedValue(null);
    const res = await GET(req(), ctx(ORDER_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-UUID id (getAdminOrder yields null)", async () => {
    hasValidAdminSession.mockResolvedValue(true);
    getAdminOrder.mockResolvedValue(null);
    const res = await GET(req(), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
  });
});

describe("GET packing-slip — success (AC-22/23)", () => {
  it("returns 200 HTML no-store with the slip body for a real order", async () => {
    hasValidAdminSession.mockResolvedValue(true);
    getAdminOrder.mockResolvedValue(order());
    const res = await GET(req(), ctx(ORDER_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("PP-000777");
    expect(body).toContain("SKU-1");
  });

  it("shows the CANCELADO band for a cancelled order and still self-guards (edge 8)", async () => {
    hasValidAdminSession.mockResolvedValue(true);
    getAdminOrder.mockResolvedValue(order({ orderStatus: "cancelled" }));
    const res = await GET(req(), ctx(ORDER_ID));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("CANCELADO");
  });
});

describe("GET packing-slip — failure isolation", () => {
  it("returns 500 with a friendly message (never the raw error) when the read throws", async () => {
    hasValidAdminSession.mockResolvedValue(true);
    getAdminOrder.mockRejectedValue(new Error("SECRET-DB-DETAIL"));
    const res = await GET(req(), ctx(ORDER_ID));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("SECRET-DB-DETAIL");
    expect(body).toContain("No se pudo generar la guía.");
  });
});

/**
 * Packing-slip route handler (T12 Surface 7, AC-22/23/29, edge 8). Returns a
 * print-optimized HTML slip. Lives under `/admin/(app)/` but the middleware
 * matcher EXCLUDES `/api` — and, defensively, a route handler is not covered by
 * the (app) layout guard — so it SELF-GUARDS with `hasValidAdminSession()` at
 * entry (AC-29). Unauth → 401 (never leaks order/customer PII). A non-UUID /
 * missing id → 404. Cache-Control: no-store (carries PII). Mirrors
 * `products/export/route.ts`.
 */
import { hasValidAdminSession } from "@/lib/admin/session-guard";
import { getAdminOrder } from "@/lib/admin/orders/order-read";
import { buildPackingSlipHtml } from "@/lib/admin/orders/packing-slip";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await hasValidAdminSession())) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const { id } = await params;
    const order = await getAdminOrder(id);
    if (!order) {
      return new Response("Pedido no encontrado", { status: 404 });
    }
    const html = buildPackingSlipHtml(order);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[packing-slip] failed: ${message}`);
    return new Response("No se pudo generar la guía.", { status: 500 });
  }
}

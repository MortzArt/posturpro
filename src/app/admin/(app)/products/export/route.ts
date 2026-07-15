/**
 * CSV export route handler (T11 Slice 7, AC-29/34). Streams the products CSV as
 * a download. Lives under `/admin/(app)/` but the middleware matcher EXCLUDES
 * `/api` — and, defensively, a route handler is not covered by the (app) layout
 * guard — so it SELF-GUARDS with the session check at entry (AC-34). Unauth →
 * 401 (never dumps the catalog).
 */
import { hasValidAdminSession } from "@/lib/admin/session-guard";
import { generateProductsCsv } from "@/lib/admin/csv/csv-generate";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await hasValidAdminSession())) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const csv = await generateProductsCsv();
    const filename = `productos-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[csv-export] failed: ${message}`);
    return new Response("No se pudo exportar.", { status: 500 });
  }
}

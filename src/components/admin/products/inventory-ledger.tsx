import { formatRelativeDate } from "@/lib/admin/format";
import type { LedgerEntry } from "@/lib/admin/inventory/inventory-write";

/**
 * InventoryLedger (T11 Slice 6, AC-25) — read-only adjustment history, most-
 * recent-first. Server component. Deltas are signed text (color-neutral). Empty
 * state when there are no adjustments yet.
 */
export function InventoryLedger({
  entries,
  variantLabels,
}: {
  entries: LedgerEntry[];
  variantLabels: Map<string, string>;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin ajustes registrados.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Historial de ajustes de inventario</caption>
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
            <th scope="col" className="px-3 py-2 font-medium">Objetivo</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Δ</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
            <th scope="col" className="px-3 py-2 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{formatRelativeDate(entry.createdAt)}</td>
              <td className="px-3 py-2">
                {entry.variantId ? variantLabels.get(entry.variantId) ?? "Variante" : "Producto"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{entry.resultingStock}</td>
              <td className="px-3 py-2 text-muted-foreground">{entry.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

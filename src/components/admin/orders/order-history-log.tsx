import { formatRelativeDate } from "@/lib/admin/format";
import { ORDER_STATUS_META, transitionKindLabel } from "@/lib/admin/orders/order-status-meta";
import type { AdminHistoryEntry } from "@/lib/admin/orders/order-read";

/**
 * OrderHistoryLog (T12 AC-6) — the status-history audit log, newest-first (one
 * consistent direction). Each entry: `{from} → {to}` + transition-kind label +
 * optional note + relative timestamp. `transition_kind` labels come from
 * `order-status-meta` (never re-derived / string-matched). A `null` history
 * (section read failed) renders a section-scoped error while the rest of the
 * detail page still renders. Server component (presentational).
 */
export function OrderHistoryLog({ history }: { history: AdminHistoryEntry[] | null }) {
  if (history === null) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        data-testid="order-history-error"
      >
        No se pudo cargar el historial.
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin historial.</p>;
  }

  return (
    <ol className="flex flex-col gap-3" data-testid="order-history">
      {history.map((entry) => {
        const toLabel = ORDER_STATUS_META[entry.toStatus].label;
        const fromLabel = entry.fromStatus ? ORDER_STATUS_META[entry.fromStatus].label : "Creado";
        const kindLabel = transitionKindLabel(entry.transitionKind);
        return (
          <li key={entry.id} className="flex gap-2 text-sm">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" />
            <div className="min-w-0">
              <p className="text-foreground">
                {fromLabel} <span aria-hidden>→</span> {toLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {kindLabel ? <span>{kindLabel} · </span> : null}
                {entry.note ? <span>{entry.note} · </span> : null}
                {formatRelativeDate(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

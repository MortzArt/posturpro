"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Cancel01Icon, Image01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/money";
import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/config/admin-products";
import type {
  CatalogProductResult,
  CatalogVariantOption,
} from "@/lib/admin/orders/manual-order-catalog";
import type { ManualOrderLineValue } from "@/app/admin/(app)/orders/manual-order-form-state";
import type { ManualOrderLineIssue } from "@/lib/admin/orders/manual-order-write";
import { searchManualOrderCatalog } from "@/app/admin/(app)/orders/actions";

/** One selectable target flattened from a product/variant search result. */
interface SelectableTarget {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  variantLabel: string | null;
  coverUrl: string | null;
  stock: number;
  unitPriceCents: number;
}

interface ManualOrderLineEditorProps {
  lines: ManualOrderLineValue[];
  issues: ManualOrderLineIssue[];
  disabled: boolean;
  onAdd: (line: ManualOrderLineValue) => void;
  onRemove: (lineKey: string) => void;
  onQtyChange: (lineKey: string, quantity: number) => void;
}

/**
 * The manual-order line editor + product/variant picker (T17, the core new UI).
 * Search (debounced 300ms) → in-flow `role=listbox` results (no portal) → add a
 * bounded-qty line. Live stock + server-recalculated price come from the search
 * action; the client never computes a price. Per-line issues (out-of-stock /
 * price-changed) attach to the offending line with the live value. Emits the
 * hidden inputs the action reads. Fully keyboard-operable + reduced-motion-safe.
 */
export function ManualOrderLineEditor({
  lines,
  issues,
  disabled,
  onAdd,
  onRemove,
  onQtyChange,
}: ManualOrderLineEditorProps) {
  return (
    <div className="flex flex-col gap-4">
      <ProductPicker disabled={disabled} existingKeys={lines.map((line) => line.lineKey)} onAdd={onAdd} />
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground" data-testid="manual-order-lines-empty">
          Agrega productos al pedido.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <LineRow
              key={line.lineKey}
              line={line}
              issue={issues.find((candidate) => candidate.lineKey === line.lineKey) ?? null}
              disabled={disabled}
              onRemove={onRemove}
              onQtyChange={onQtyChange}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ picker -- */

interface ProductPickerProps {
  disabled: boolean;
  existingKeys: string[];
  onAdd: (line: ManualOrderLineValue) => void;
}

function ProductPicker({ disabled, existingKeys, onAdd }: ProductPickerProps) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CatalogProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestIdRef = useRef(0);
  const listboxId = useId();

  const targets = flattenTargets(results);

  const runSearch = useCallback(async (value: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const found = await searchManualOrderCatalog(trimmed);
      // Ignore a stale response (a newer request already fired).
      if (requestIdRef.current !== requestId) {
        return;
      }
      setResults(found);
      // Highlight the first IN-STOCK target, not blindly row 0 — row 0 may be an
      // out-of-stock (aria-disabled) option, and aria-activedescendant must not
      // point at a non-selectable row. Falls back to 0 when nothing is in stock.
      setActiveIndex(firstSelectableIndex(found));
    } catch (caught) {
      if (requestIdRef.current === requestId) {
        console.error(`[manual-order] picker search failed: ${caught instanceof Error ? caught.message : "unknown"}`);
        setResults([]);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  const onTermChange = (value: string): void => {
    setTerm(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, ADMIN_SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  const addTarget = (target: SelectableTarget): void => {
    if (target.stock <= 0) {
      return;
    }
    const lineKey = `${target.productId}:${target.variantId ?? "-"}`;
    if (existingKeys.includes(lineKey)) {
      // Already in the order; just reset the search for the next add.
      resetSearch();
      return;
    }
    onAdd({
      lineKey,
      productId: target.productId,
      variantId: target.variantId,
      quantity: 1,
      productName: target.name,
      productSku: target.sku,
      variantLabel: target.variantLabel,
      unitPriceCents: target.unitPriceCents,
      coverUrl: target.coverUrl,
    });
    resetSearch();
  };

  const resetSearch = (): void => {
    setTerm("");
    setResults([]);
    setOpen(false);
    setActiveIndex(0);
  };

  const selectableIndexes = targets
    .map((target, index) => (target.stock > 0 ? index : -1))
    .filter((index) => index >= 0);

  const moveActive = (direction: 1 | -1): void => {
    if (selectableIndexes.length === 0) {
      return;
    }
    const position = selectableIndexes.indexOf(activeIndex);
    const nextPosition =
      position === -1
        ? 0
        : Math.min(Math.max(position + direction, 0), selectableIndexes.length - 1);
    setActiveIndex(selectableIndexes[nextPosition]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open || targets.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (selectableIndexes.length > 0) setActiveIndex(selectableIndexes[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      if (selectableIndexes.length > 0) setActiveIndex(selectableIndexes[selectableIndexes.length - 1]);
    } else if (event.key === "Enter") {
      // Enter ONLY — this is an editable (`type="search"`) combobox, so Space must
      // stay a literal character so multi-word queries ("faja lumbar") work. The
      // ARIA APG uses Enter for editable-combobox selection, not Space.
      const target = targets[activeIndex];
      if (target && target.stock > 0) {
        event.preventDefault();
        addTarget(target);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetSearch();
    }
  };

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} aria-hidden />
        </span>
        <label htmlFor={`${listboxId}-input`} className="sr-only">
          Buscar producto por nombre o SKU
        </label>
        <input
          id={`${listboxId}-input`}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && targets[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          value={term}
          disabled={disabled}
          onChange={(event) => onTermChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscar producto por nombre o SKU…"
          data-testid="manual-order-search"
          className="min-h-11 w-full rounded-md border border-border bg-background pl-9 pr-9 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2" data-testid="manual-order-search-spinner">
            <span className="block size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden />
          </span>
        ) : null}
      </div>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="enter-fade z-10 max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
          data-testid="manual-order-results"
        >
          {loading && targets.length === 0 ? (
            <SearchSkeleton />
          ) : targets.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground" data-testid="manual-order-no-results">
              Sin resultados.
            </li>
          ) : (
            targets.map((target, index) => (
              <ResultRow
                key={target.key}
                id={`${listboxId}-${index}`}
                target={target}
                active={index === activeIndex}
                alreadyAdded={existingKeys.includes(`${target.productId}:${target.variantId ?? "-"}`)}
                onSelect={() => addTarget(target)}
              />
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Flatten product results into selectable rows (one per variant / no-variant). */
/** Index (in the flattened target list) of the first in-stock target, else 0. */
function firstSelectableIndex(results: CatalogProductResult[]): number {
  const index = flattenTargets(results).findIndex((target) => target.stock > 0);
  return index >= 0 ? index : 0;
}

function flattenTargets(results: CatalogProductResult[]): SelectableTarget[] {
  const targets: SelectableTarget[] = [];
  for (const product of results) {
    if (product.variants === null) {
      targets.push({
        key: product.productId,
        productId: product.productId,
        variantId: null,
        name: product.name,
        sku: product.sku,
        variantLabel: null,
        coverUrl: product.coverUrl,
        stock: product.stock,
        unitPriceCents: product.unitPriceCents,
      });
      continue;
    }
    for (const variant of product.variants) {
      targets.push(toVariantTarget(product, variant));
    }
  }
  return targets;
}

function toVariantTarget(product: CatalogProductResult, variant: CatalogVariantOption): SelectableTarget {
  return {
    key: `${product.productId}:${variant.variantId}`,
    productId: product.productId,
    variantId: variant.variantId,
    name: product.name,
    sku: product.sku,
    variantLabel: variant.label,
    coverUrl: product.coverUrl,
    stock: variant.stock,
    unitPriceCents: variant.unitPriceCents,
  };
}

function SearchSkeleton() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 px-3 py-2" aria-hidden>
          <span className="size-9 shrink-0 rounded-md bg-muted animate-pulse" />
          <span className="h-4 flex-1 rounded bg-muted animate-pulse" />
        </li>
      ))}
    </>
  );
}

interface ResultRowProps {
  id: string;
  target: SelectableTarget;
  active: boolean;
  alreadyAdded: boolean;
  onSelect: () => void;
}

function ResultRow({ id, target, active, alreadyAdded, onSelect }: ResultRowProps) {
  const isOut = target.stock <= 0;
  const stockText = stockLabel(target.stock);
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-disabled={isOut}
      data-testid={`manual-order-result-${target.productId}${target.variantId ? `-${target.variantId}` : ""}`}
      onClick={isOut ? undefined : onSelect}
      className={cn(
        "flex min-w-0 items-center gap-3 px-3 py-2 text-sm",
        !isOut && "cursor-pointer",
        active && !isOut && "bg-muted",
        isOut && "cursor-not-allowed opacity-60",
      )}
    >
      <Thumb url={target.coverUrl} name={target.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="min-w-0 break-words font-medium text-foreground">{target.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{target.sku}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {target.variantLabel ?? "Sin variantes"} · {stockText}
          {isOut ? "" : ` · ${formatMXN(target.unitPriceCents)}`}
          {alreadyAdded ? " · ya agregado" : ""}
        </span>
      </span>
    </li>
  );
}

/** A 36px cover thumbnail (mirrors the product-table Thumbnail null-degrade). */
function Thumb({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground/50">
        <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return (
    <Image
      src={url}
      alt={name}
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-md border border-border bg-muted object-cover"
    />
  );
}

/* --------------------------------------------------------------- line rows -- */

interface LineRowProps {
  line: ManualOrderLineValue;
  issue: ManualOrderLineIssue | null;
  disabled: boolean;
  onRemove: (lineKey: string) => void;
  onQtyChange: (lineKey: string, quantity: number) => void;
}

function LineRow({ line, issue, disabled, onRemove, onQtyChange }: LineRowProps) {
  // A price-changed issue adopts the live price for display + resubmit (edge 5).
  const displayPrice =
    issue?.kind === "price-changed" && issue.liveUnitPriceCents !== undefined
      ? issue.liveUnitPriceCents
      : line.unitPriceCents;
  const lineTotal = displayPrice * line.quantity;

  return (
    <li
      data-invalid={issue ? "true" : undefined}
      data-testid={`manual-order-line-${line.lineKey}`}
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border p-3",
        issue && "border-destructive/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Thumb url={line.coverUrl} name={line.productName} />
          <div className="min-w-0">
            <p className="min-w-0 break-words text-sm font-medium text-foreground">{line.productName}</p>
            <p className="break-words font-mono text-xs text-muted-foreground">
              {line.productSku}
              {line.variantLabel ? ` · ${line.variantLabel}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{formatMXN(displayPrice)} c/u</p>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(line.lineKey)}
          aria-label={`Quitar ${line.productName} del pedido`}
          data-testid={`manual-order-remove-${line.lineKey}`}
          className="shrink-0 rounded-md p-1 text-muted-foreground outline-none transition-transform hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-95 disabled:opacity-60"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <QtyStepper line={line} disabled={disabled} onQtyChange={onQtyChange} />
        <span className="tabular-nums text-sm font-medium" data-testid={`manual-order-line-total-${line.lineKey}`}>
          {formatMXN(lineTotal)}
        </span>
      </div>

      {issue ? <LineIssueRow issue={issue} /> : null}

      <input type="hidden" name="line_key" value={line.lineKey} />
      <input type="hidden" name="line_product_id" value={line.productId} />
      <input type="hidden" name="line_variant_id" value={line.variantId ?? ""} />
      <input type="hidden" name="line_qty" value={line.quantity} />
      <input type="hidden" name="line_product_name" value={line.productName} />
      <input type="hidden" name="line_product_sku" value={line.productSku} />
      <input type="hidden" name="line_variant_label" value={line.variantLabel ?? ""} />
      <input type="hidden" name="line_unit_price_cents" value={line.unitPriceCents} />
      <input type="hidden" name="line_cover_url" value={line.coverUrl ?? ""} />
    </li>
  );
}

function QtyStepper({
  line,
  disabled,
  onQtyChange,
}: {
  line: ManualOrderLineValue;
  disabled: boolean;
  onQtyChange: (lineKey: string, quantity: number) => void;
}) {
  const set = (next: number): void => {
    const clamped = Math.max(1, Math.min(next, Number.MAX_SAFE_INTEGER));
    onQtyChange(line.lineKey, clamped);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Cantidad</span>
      <div className="flex items-center rounded-md border border-border">
        <button
          type="button"
          disabled={disabled || line.quantity <= 1}
          onClick={() => set(line.quantity - 1)}
          aria-label={`Disminuir cantidad de ${line.productName}`}
          data-testid={`manual-order-qty-dec-${line.lineKey}`}
          className="min-h-9 min-w-9 rounded-l-md text-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-95 disabled:opacity-40"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={line.quantity}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value.replace(/[^\d]/g, ""));
            set(Number.isFinite(next) && next > 0 ? next : 1);
          }}
          aria-label={`Cantidad de ${line.productName}`}
          data-testid={`manual-order-qty-${line.lineKey}`}
          className="min-h-9 w-12 border-x border-border bg-background text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => set(line.quantity + 1)}
          aria-label={`Aumentar cantidad de ${line.productName}`}
          data-testid={`manual-order-qty-inc-${line.lineKey}`}
          className="min-h-9 min-w-9 rounded-r-md text-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-95 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function LineIssueRow({ issue }: { issue: ManualOrderLineIssue }) {
  const message =
    issue.kind === "price-changed" && issue.liveUnitPriceCents !== undefined
      ? `El precio cambió a ${formatMXN(issue.liveUnitPriceCents)}`
      : issue.kind === "unavailable"
        ? "Producto no disponible"
        : "Sin stock disponible";
  return (
    <p
      role="alert"
      className="enter-fade flex items-center gap-1 text-xs text-destructive"
      data-testid="manual-order-line-issue"
    >
      <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={2} aria-hidden />
      {message}
    </p>
  );
}

/** es-MX stock label: "agotado" / "1 disponible" / "N disponibles". */
function stockLabel(stock: number): string {
  if (stock <= 0) {
    return "agotado";
  }
  return stock === 1 ? "1 disponible" : `${stock} disponibles`;
}

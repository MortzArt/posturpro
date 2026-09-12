import type { SpecRow } from "@/lib/catalog/product-detail.types";
import { cn } from "@/lib/utils";

/**
 * ProductSpecs (T4 AC-10) — a semantic definition list of dimensions, weight,
 * and materials. Pure presentational server component: `rows` arrive pre-built
 * (mm→cm / g→kg converted, null specs omitted) from `buildSpecRows` in the page.
 * The PAGE gates rendering — if `rows` is empty it does not render this section
 * at all — so every row here is displayable. Rows run two-up from `sm` and
 * single-column again on `lg`, where this sits in the narrow middle column.
 */

interface ProductSpecsProps {
  rows: SpecRow[];
  heading: string;
  className?: string;
}

export function ProductSpecs({ rows, heading, className }: ProductSpecsProps) {
  return (
    <section className={cn(className)} data-testid="product-specs">
      <h2 className="mb-4 font-heading text-sm tracking-[-0.02em] text-foreground">
        {heading}
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex justify-between gap-4 border-b border-border py-2"
            data-testid={`spec-row-${row.key}`}
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-right text-sm font-medium tabular-nums text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

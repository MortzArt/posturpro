import type { SpecRow } from "@/lib/catalog/product-detail.types";

/**
 * ProductSpecs (T4 AC-10) — a semantic definition list of dimensions, weight,
 * and materials. Pure presentational server component: `rows` arrive pre-built
 * (mm→cm / g→kg converted, null specs omitted) from `buildSpecRows` in the page.
 * The PAGE gates rendering — if `rows` is empty it does not render this section
 * at all — so every row here is displayable.
 */

interface ProductSpecsProps {
  rows: SpecRow[];
  heading: string;
}

export function ProductSpecs({ rows, heading }: ProductSpecsProps) {
  return (
    <section className="mt-10 md:mt-12" data-testid="product-specs">
      <h2 className="mb-4 text-sm font-medium tracking-tight text-foreground">
        {heading}
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex justify-between gap-4 border-b border-border/60 py-2"
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

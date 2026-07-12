import { Link } from "@/i18n/navigation";
import { categoryPath } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { CatalogCategory } from "@/lib/catalog/types";

/**
 * CategoryTree (T3 AC-3, edge case 4) — the `/categorias` index. Renders active
 * categories with nesting expressed through REAL list semantics (a nested
 * `<ul>` inside a parent's `<li>`), not visual indent alone, so screen readers
 * convey the hierarchy. Each row links to `/categorias/[slug]`. Server
 * component; the tree comes pre-built and pre-sorted from `listCategories()`.
 */

interface CategoryTreeProps {
  categories: CatalogCategory[];
}

export function CategoryTree({ categories }: CategoryTreeProps) {
  return (
    <ul
      className="flex flex-col gap-3"
      data-testid="category-tree"
    >
      {categories.map((category, index) => (
        <CategoryNode
          key={category.id}
          category={category}
          depth={0}
          staggerIndex={index}
        />
      ))}
    </ul>
  );
}

interface CategoryNodeProps {
  category: CatalogCategory;
  depth: number;
  staggerIndex: number;
}

const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

function CategoryNode({ category, depth, staggerIndex }: CategoryNodeProps) {
  const children = category.children ?? [];
  const delayMs = Math.min(staggerIndex, STAGGER_MAX_STEPS) * STAGGER_STEP_MS;

  return (
    <li
      className={depth === 0 ? "stagger" : undefined}
      style={depth === 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      <Link
        href={categoryPath(category.slug)}
        data-testid="category-tree-link"
        className={cn(
          "card-lift block rounded-lg border border-border bg-card p-4 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span className="text-sm font-medium tracking-tight text-foreground">
          {category.name}
        </span>
        {category.description ? (
          <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
            {category.description}
          </span>
        ) : null}
      </Link>

      {children.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3 border-l border-border pl-6">
          {children.map((child, index) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              staggerIndex={index}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

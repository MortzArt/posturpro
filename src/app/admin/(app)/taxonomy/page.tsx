import { AdminPage } from "@/components/admin/admin-page";
import { TaxonomyManager } from "@/components/admin/taxonomy/taxonomy-manager";
import {
  listBrands,
  listStyles,
  listTags,
  listCategories,
  listCategoryOptions,
} from "@/lib/admin/taxonomy/taxonomy-read";
import type { TaxonomyKind } from "@/lib/admin/taxonomy/taxonomy-input";

/**
 * Taxonomy manager page (T11 Slice 5). Server component: loads all four entity
 * sets + the flattened category options (for the parent select), then hands off
 * to the tabbed client manager. The active tab is deep-linked via `?tab=`.
 */
export const dynamic = "force-dynamic";

const VALID_TABS: TaxonomyKind[] = ["brand", "category", "style", "tag"];

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = VALID_TABS.includes(tab as TaxonomyKind) ? (tab as TaxonomyKind) : "brand";

  const [brands, styles, tags, categories, categoryOptions] = await Promise.all([
    listBrands(),
    listStyles(),
    listTags(),
    listCategories(),
    listCategoryOptions(),
  ]);

  return (
    <AdminPage title="Taxonomía" description="Marcas, categorías, estilos y etiquetas del catálogo.">
      <TaxonomyManager
        initialTab={initialTab}
        brands={brands}
        styles={styles}
        tags={tags}
        categories={categories}
        categoryOptions={categoryOptions}
      />
    </AdminPage>
  );
}

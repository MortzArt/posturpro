import { AdminPage } from "@/components/admin/admin-page";
import { ProductForm } from "@/components/admin/products/product-form";
import { emptyProductFormValues } from "@/app/admin/(app)/products/products-form-state";
import {
  listBrandOptions,
  listStyleOptions,
  listCategoryOptions,
  listTags,
} from "@/lib/admin/taxonomy/taxonomy-read";

/**
 * New product page (T11 Slice 2). Renders the shared `ProductForm` in create
 * mode (empty values, no image/variant sections until the product has an id).
 * On save, the action redirects to `/[id]/edit`.
 */
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [brands, styles, categories, tags] = await Promise.all([
    listBrandOptions(),
    listStyleOptions(),
    listCategoryOptions(),
    listTags(),
  ]);

  return (
    <AdminPage title="Nuevo producto" description="Crea un producto. Podrás agregar imágenes y variantes al guardar.">
      <ProductForm
        productId=""
        previousSlug=""
        initialValues={emptyProductFormValues}
        isEdit={false}
        brands={brands}
        styles={styles}
        categories={categories}
        tagSuggestions={tags.map((tag) => tag.name)}
      />
    </AdminPage>
  );
}

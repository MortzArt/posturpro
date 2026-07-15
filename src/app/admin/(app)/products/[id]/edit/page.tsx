import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { ProductForm } from "@/components/admin/products/product-form";
import { ImageManager } from "@/components/admin/products/image-manager";
import { VariantEditor } from "@/components/admin/products/variant-editor";
import { InventoryLedger } from "@/components/admin/products/inventory-ledger";
import { EditPageBanner } from "@/components/admin/products/edit-page-banner";
import { readProductForEdit } from "@/lib/admin/products/product-read";
import { listAdjustments } from "@/lib/admin/inventory/inventory-write";
import {
  listBrandOptions,
  listStyleOptions,
  listCategoryOptions,
  listTags,
} from "@/lib/admin/taxonomy/taxonomy-read";

/**
 * Edit product page (T11 Slice 2/3/4/6). SSR-loads the product + variants +
 * images + taxonomy, renders the shared form, and appends the image manager,
 * variant editor, and inventory ledger as edit-only sections. `?created` /
 * `?duplicated` show a one-time success banner (create/duplicate redirect here).
 */
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; duplicated?: string }>;
}) {
  const { id } = await params;
  const { created, duplicated } = await searchParams;

  const product = await readProductForEdit(id);
  if (!product) notFound();

  const [brands, styles, categories, tags, ledger] = await Promise.all([
    listBrandOptions(),
    listStyleOptions(),
    listCategoryOptions(),
    listTags(),
    listAdjustments(id),
  ]);

  const variantLabels = new Map(product.variants.map((variant) => [variant.id, variant.colorName]));

  const bannerKind = duplicated ? "duplicated" : created ? "created" : null;

  return (
    <AdminPage title="Editar producto" description={product.name}>
      {bannerKind ? <EditPageBanner kind={bannerKind} /> : null}
      <ProductForm
        productId={product.id}
        previousSlug={product.slug}
        initialValues={product.values}
        isEdit
        brands={brands}
        styles={styles}
        categories={categories}
        tagSuggestions={tags.map((tag) => tag.name)}
        editSections={
          <>
            <ImageManager productId={product.id} initialImages={product.images} />
            <VariantEditor
              productId={product.id}
              basePrice={product.values.price}
              initialVariants={product.variants}
            />
            <section
              id="inventario-historial"
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:p-6"
            >
              <h2 className="text-sm font-semibold tracking-tight">Historial de inventario</h2>
              <InventoryLedger entries={ledger} variantLabels={variantLabels} />
            </section>
          </>
        }
      />
    </AdminPage>
  );
}

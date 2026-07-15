"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaxonomyEntityDialog, type TaxonomyEntityDraft } from "@/components/admin/taxonomy/taxonomy-entity-dialog";
import { TaxonomyDeleteDialog } from "@/components/admin/taxonomy/taxonomy-delete-dialog";
import { CategoryTree } from "@/components/admin/taxonomy/category-tree";
import { toggleActiveAction } from "@/app/admin/(app)/taxonomy/actions";
import type {
  BrandRow,
  StyleRow,
  TagRow,
  CategoryRow,
  CategoryOption,
} from "@/lib/admin/taxonomy/taxonomy-read";
import type { TaxonomyKind } from "@/lib/admin/taxonomy/taxonomy-input";
import type { TaxonomyTable } from "@/lib/admin/taxonomy/taxonomy-write";

/**
 * TaxonomyManager (T11 Slice 5) — the tabbed manager (brands/categories/styles/
 * tags). Tabs reflect `?tab=`. Each tab has a "Nueva …" CTA that opens the
 * shared entity dialog; rows have edit + delete. Categories render as a tree.
 * Client component orchestrating the dialogs; refreshes on any write.
 */
interface TaxonomyManagerProps {
  initialTab: TaxonomyKind;
  brands: BrandRow[];
  styles: StyleRow[];
  tags: TagRow[];
  categories: CategoryRow[];
  categoryOptions: CategoryOption[];
}

const EMPTY_DRAFT: TaxonomyEntityDraft = {
  id: "", name: "", slug: "", description: "", logoUrl: "", isActive: true, parentId: "", sortOrder: "0",
};

export function TaxonomyManager(props: TaxonomyManagerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TaxonomyKind>(props.initialTab);
  const [dialogKind, setDialogKind] = useState<TaxonomyKind | null>(null);
  const [draft, setDraft] = useState<TaxonomyEntityDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ table: TaxonomyTable; id: string; label: string; hasChildren: boolean } | null>(null);

  const refresh = (): void => router.refresh();

  const openCreate = (kind: TaxonomyKind): void => {
    setDraft({ ...EMPTY_DRAFT });
    setDialogKind(kind);
  };
  const openEdit = (kind: TaxonomyKind, next: TaxonomyEntityDraft): void => {
    setDraft(next);
    setDialogKind(kind);
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => { setTab(value as TaxonomyKind); router.replace(`/admin/taxonomy?tab=${value}`, { scroll: false }); }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="brand" data-testid="taxonomy-tab-brand">Marcas</TabsTrigger>
            <TabsTrigger value="category" data-testid="taxonomy-tab-category">Categorías</TabsTrigger>
            <TabsTrigger value="style" data-testid="taxonomy-tab-style">Estilos</TabsTrigger>
            <TabsTrigger value="tag" data-testid="taxonomy-tab-tag">Etiquetas</TabsTrigger>
          </TabsList>
          <Button size="sm" onClick={() => openCreate(tab)} data-testid="taxonomy-new">
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} aria-hidden />
            Nueva {tab === "brand" ? "marca" : tab === "category" ? "categoría" : tab === "style" ? "estilo" : "etiqueta"}
          </Button>
        </div>

        <TabsContent value="brand">
          <SimpleTable
            emptyLabel="Aún no hay marcas."
            rows={props.brands.map((brand) => ({ id: brand.id, primary: brand.name, secondary: brand.slug, active: brand.isActive }))}
            table="brands"
            onEdit={(id) => { const b = props.brands.find((x) => x.id === id)!; openEdit("brand", { ...EMPTY_DRAFT, id, name: b.name, slug: b.slug, description: b.description ?? "", logoUrl: b.logoUrl ?? "", isActive: b.isActive }); }}
            onDelete={(id, label) => setDeleteTarget({ table: "brands", id, label, hasChildren: false })}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="category">
          <CategoryTree
            categories={props.categories}
            onEdit={(category) => openEdit("category", { ...EMPTY_DRAFT, id: category.id, name: category.name, slug: category.slug, description: category.description ?? "", isActive: category.isActive, parentId: category.parentId ?? "", sortOrder: String(category.sortOrder) })}
            onDelete={(category, hasChildren) => setDeleteTarget({ table: "categories", id: category.id, label: category.name, hasChildren })}
          />
        </TabsContent>

        <TabsContent value="style">
          <SimpleTable
            emptyLabel="Aún no hay estilos."
            rows={props.styles.map((style) => ({ id: style.id, primary: style.name, secondary: style.slug, active: style.isActive }))}
            table="styles"
            onEdit={(id) => { const s = props.styles.find((x) => x.id === id)!; openEdit("style", { ...EMPTY_DRAFT, id, name: s.name, slug: s.slug, description: s.description ?? "", isActive: s.isActive }); }}
            onDelete={(id, label) => setDeleteTarget({ table: "styles", id, label, hasChildren: false })}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="tag">
          <SimpleTable
            emptyLabel="Aún no hay etiquetas."
            rows={props.tags.map((tagRow) => ({ id: tagRow.id, primary: tagRow.name, secondary: tagRow.slug, active: null }))}
            table="tags"
            onEdit={(id) => { const t = props.tags.find((x) => x.id === id)!; openEdit("tag", { ...EMPTY_DRAFT, id, name: t.name, slug: t.slug }); }}
            onDelete={(id, label) => setDeleteTarget({ table: "tags", id, label, hasChildren: false })}
            onRefresh={refresh}
          />
        </TabsContent>
      </Tabs>

      {dialogKind ? (
        <TaxonomyEntityDialog
          kind={dialogKind}
          open={dialogKind !== null}
          onOpenChange={(open) => { if (!open) setDialogKind(null); }}
          draft={draft}
          categoryOptions={props.categoryOptions}
          onSaved={refresh}
        />
      ) : null}

      {deleteTarget ? (
        <TaxonomyDeleteDialog
          target={deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          onDeleted={refresh}
        />
      ) : null}
    </div>
  );
}

interface SimpleRow {
  id: string;
  primary: string;
  secondary: string;
  active: boolean | null;
}

/** A flat brand/style/tag table with edit + delete + an active toggle. */
function SimpleTable({
  rows, emptyLabel, table, onEdit, onDelete, onRefresh,
}: {
  rows: SimpleRow[];
  emptyLabel: string;
  table: "brands" | "styles" | "tags";
  onEdit: (id: string) => void;
  onDelete: (id: string, label: string) => void;
  onRefresh: () => void;
}) {
  const [, startTransition] = useTransition();
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const toggle = (id: string, next: boolean): void => {
    if (table === "tags") return;
    startTransition(async () => {
      await toggleActiveAction(table, id, next);
      onRefresh();
    });
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0" data-testid={`taxonomy-row-${row.id}`}>
              <td className="px-3 py-2">
                <span className="font-medium">{row.primary}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{row.secondary}</span>
              </td>
              <td className="px-3 py-2">
                {row.active !== null ? (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={row.active} onChange={(e) => toggle(row.id, e.target.checked)} className="size-3.5 accent-primary" data-testid={`taxonomy-active-${row.id}`} />
                    {row.active ? "Activo" : <Badge variant="outline">Inactivo</Badge>}
                  </label>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(row.id)} data-testid={`taxonomy-edit-${row.id}`}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(row.id, row.primary)} data-testid={`taxonomy-delete-${row.id}`}>Eliminar</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

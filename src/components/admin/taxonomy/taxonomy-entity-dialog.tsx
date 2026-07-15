"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banner, SelectField, SwitchField, TextField, TextareaField } from "@/components/admin/form/fields";
import {
  saveBrandAction,
  saveStyleAction,
  saveTagAction,
  saveCategoryAction,
} from "@/app/admin/(app)/taxonomy/actions";
import {
  TAXONOMY_FIELD_ERROR_COPY,
  TAXONOMY_WRITE_FAILED_MESSAGE,
} from "@/components/admin/taxonomy/taxonomy-error-copy";
import { slugify } from "@/lib/admin/products/slug";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import type { TaxonomyKind, TaxonomyFieldErrors } from "@/lib/admin/taxonomy/taxonomy-input";
import type { CategoryOption } from "@/lib/admin/taxonomy/taxonomy-read";

/** The fields an edited entity carries (subset per kind). */
export interface TaxonomyEntityDraft {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  isActive: boolean;
  parentId: string;
  sortOrder: string;
}

const KIND_LABELS: Record<TaxonomyKind, string> = {
  brand: "marca",
  style: "estilo",
  tag: "etiqueta",
  category: "categoría",
};

/**
 * TaxonomyEntityDialog (T11 Slice 5) — the shared create/edit form for a brand,
 * style, tag, or category. Slug auto-suggests from the name until edited.
 * Category adds a parent select (excluding itself + descendants) + sort order.
 * On success closes + refreshes; field errors surface inline.
 */
export function TaxonomyEntityDialog({
  kind,
  open,
  onOpenChange,
  draft,
  categoryOptions,
  onSaved,
}: {
  kind: TaxonomyKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TaxonomyEntityDraft | null;
  categoryOptions?: CategoryOption[];
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(draft?.name ?? "");
  const [slug, setSlug] = useState(draft?.slug ?? "");
  const [slugAuto, setSlugAuto] = useState((draft?.slug ?? "") === "");
  const [errors, setErrors] = useState<TaxonomyFieldErrors>({});
  const [writeError, setWriteError] = useState<string | null>(null);
  const isEdit = Boolean(draft?.id);

  const onSubmit = (formData: FormData): void => {
    setErrors({});
    setWriteError(null);
    startTransition(async () => {
      const result = await runSave(kind, draft?.id ?? "", formData);
      if (result.ok) {
        onOpenChange(false);
        onSaved();
        return;
      }
      if (result.reason === "field") {
        const field = result.error === "slug-duplicate" || result.error.startsWith("slug") ? "slug" : result.error === "cycle" ? "parent_id" : result.error.startsWith("name") ? "name" : "description";
        setErrors({ [field]: result.error });
      } else if (result.reason === "restrict") {
        setWriteError("No se puede: hay dependencias.");
      } else {
        setWriteError(TAXONOMY_WRITE_FAILED_MESSAGE);
      }
    });
  };

  const err = (field: keyof TaxonomyFieldErrors): string | null => {
    const key = errors[field];
    return key ? TAXONOMY_FIELD_ERROR_COPY[key] : null;
  };

  const parentOptions = buildParentOptions(categoryOptions, draft?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-content-motion" data-testid="taxonomy-dialog">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar" : "Nueva"} {KIND_LABELS[kind]}
          </DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="flex flex-col gap-4">
          <TextField name="name" label="Nombre" required testid="taxonomy-name" value={name} onChange={(e) => { setName(e.target.value); if (slugAuto) setSlug(slugify(e.target.value)); }} error={err("name")} disabled={pending} />
          <TextField name="slug" label="Slug" required testid="taxonomy-slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugAuto(false); }} error={err("slug")} disabled={pending} inputClassName="font-mono" />

          {kind === "brand" || kind === "style" || kind === "category" ? (
            <TextareaField name="description" label="Descripción" defaultValue={draft?.description ?? ""} testid="taxonomy-description" error={err("description")} disabled={pending} rows={3} />
          ) : null}

          {kind === "brand" ? (
            <TextField name="logo_url" label="URL del logo" type="url" testid="taxonomy-logo" defaultValue={draft?.logoUrl ?? ""} error={err("logo_url")} disabled={pending} />
          ) : null}

          {kind === "category" ? (
            <>
              <SelectField name="parent_id" label="Categoría padre" testid="taxonomy-parent" defaultValue={draft?.parentId ?? ""} options={parentOptions} error={err("parent_id")} disabled={pending} />
              <TextField name="sort_order" label="Orden" testid="taxonomy-sort" defaultValue={draft?.sortOrder ?? "0"} disabled={pending} inputClassName="tabular-nums" />
            </>
          ) : null}

          {kind === "brand" || kind === "style" || kind === "category" ? (
            <SwitchField name="is_active" label="Activo" defaultChecked={draft ? draft.isActive : true} testid="taxonomy-active" disabled={pending} />
          ) : null}

          {writeError ? <Banner role="alert" tone="error" icon={Alert02Icon} message={writeError} testid="taxonomy-write-error" /> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending} data-testid="taxonomy-save">{pending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Run the correct save action for the entity kind. */
function runSave(kind: TaxonomyKind, id: string, formData: FormData) {
  switch (kind) {
    case "brand":
      return saveBrandAction(id, formData);
    case "style":
      return saveStyleAction(id, formData);
    case "tag":
      return saveTagAction(id, formData);
    case "category":
      return saveCategoryAction(id, formData);
  }
}

/** Parent options for a category, excluding itself (descendant-exclusion is a
 * DB-backed safety net; the obvious self-parent is removed here). */
function buildParentOptions(
  categoryOptions: CategoryOption[] | undefined,
  editingId: string | undefined,
): { value: string; label: string }[] {
  const base = [{ value: "", label: "Sin padre (raíz)" }];
  if (!categoryOptions) return base;
  return [
    ...base,
    ...categoryOptions
      .filter((option) => option.value !== editingId)
      .map((option) => ({ value: option.value, label: `${"— ".repeat(option.depth)}${option.label}` })),
  ];
}

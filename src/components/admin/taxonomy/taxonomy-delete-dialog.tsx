"use client";

import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteTaxonomyAction } from "@/app/admin/(app)/taxonomy/actions";
import { TAXONOMY_RESTRICT_MESSAGE, TAXONOMY_WRITE_FAILED_MESSAGE } from "@/components/admin/taxonomy/taxonomy-error-copy";
import type { TaxonomyTable } from "@/lib/admin/taxonomy/taxonomy-write";

/**
 * TaxonomyDeleteDialog (T11 Slice 5, AC-23) — confirm + delete with the correct
 * es-MX consequence per table. A child-bearing category is pre-blocked (client
 * `hasChildren`) with the restrict message; the DB `on delete restrict` is the
 * safety net (surfaced here too if the client check is bypassed).
 */
interface DeleteTarget {
  table: TaxonomyTable;
  id: string;
  label: string;
  hasChildren: boolean;
}

const CONSEQUENCE: Record<TaxonomyTable, string> = {
  brands: "Los productos con esta marca quedarán sin marca.",
  styles: "Los productos con este estilo quedarán sin estilo.",
  tags: "Se quitará de los productos que la usan.",
  categories: "Se quitará de los productos que la usan.",
};

export function TaxonomyDeleteDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: DeleteTarget;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blocked = target.table === "categories" && target.hasChildren;

  const onConfirm = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTaxonomyAction(target.table, target.id);
      if (result.ok) {
        onOpenChange(false);
        onDeleted();
        return;
      }
      setError(result.reason === "restrict" ? TAXONOMY_RESTRICT_MESSAGE : TAXONOMY_WRITE_FAILED_MESSAGE);
    });
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent className="dialog-content-motion" data-testid="taxonomy-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar “{target.label}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked ? TAXONOMY_RESTRICT_MESSAGE : CONSEQUENCE[target.table]}
            {error ? ` ${error}` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {!blocked ? (
            <AlertDialogAction onClick={onConfirm} disabled={pending} data-testid="taxonomy-delete-confirm">
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

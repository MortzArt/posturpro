"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/components/admin/products/csv-import-dialog";

/**
 * CsvToolbar (T11 Slice 7) — the two CSV buttons in the product-list header:
 * "Exportar CSV" (downloads via the guarded route) and "Importar CSV" (opens the
 * dry-run stepper dialog). Export is a plain link to the guarded route handler
 * so the browser handles the download.
 */
export function CsvToolbar() {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
      <Button asChild variant="secondary" size="sm" data-testid="admin-csv-export">
        <a href="/admin/products/export" download>
          <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={2} aria-hidden />
          Exportar CSV
        </a>
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)} data-testid="admin-csv-import">
        <HugeiconsIcon icon={Upload01Icon} size={16} strokeWidth={2} aria-hidden />
        Importar CSV
      </Button>
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

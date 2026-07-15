"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/admin/form/fields";
import {
  dryRunImportAction,
  confirmImportAction,
} from "@/app/admin/(app)/products/csv-actions";
import { CSV_COLUMNS } from "@/lib/config";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { ImportDiff } from "@/lib/admin/csv/csv-product-map";
import type { ImportWriteResult } from "@/lib/admin/csv/csv-import-write";

/**
 * CsvImportDialog (T11 Slice 7, AC-30..32) — a 4-step stepper with a MANDATORY
 * dry-run: Seleccionar → Vista previa (zero writes) → Confirmar → Resultado.
 * The file is kept and re-sent on confirm so the server re-parses (never trusts
 * a client plan). Malformed files are rejected with a named error, zero writes.
 */
type Step = "select" | "preview" | "confirm" | "result";
const STEP_LABELS: Record<Step, string> = {
  select: "Seleccionar",
  preview: "Vista previa",
  confirm: "Confirmar",
  result: "Resultado",
};
const STEP_ORDER: Step[] = ["select", "preview", "confirm", "result"];

export function CsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [summary, setSummary] = useState<ImportWriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = (): void => {
    setStep("select");
    setFile(null);
    setDiff(null);
    setSummary(null);
    setError(null);
  };

  const onSelect = (selected: File | null): void => {
    if (!selected) return;
    setFile(selected);
    setError(null);
    setStep("preview");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", selected);
      const result = await dryRunImportAction(formData);
      if (result.ok) setDiff(result.diff);
      else { setError(result.message); setStep("select"); }
    });
  };

  const onConfirm = (): void => {
    if (!file) return;
    setStep("result");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await confirmImportAction(formData);
      if (result.ok) setSummary(result.summary);
      else { setError(result.message); setStep("confirm"); }
    });
  };

  const close = (): void => {
    onOpenChange(false);
    router.refresh();
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="dialog-content-motion max-w-2xl" data-testid="csv-import-dialog">
        <DialogHeader>
          <DialogTitle>Importar productos (CSV)</DialogTitle>
        </DialogHeader>

        <Stepper current={step} />

        {error ? <Banner role="alert" tone="error" icon={Alert02Icon} message={error} testid="csv-import-error" /> : null}

        {step === "select" ? <SelectStep onSelect={onSelect} fileInputRef={fileInputRef} /> : null}
        {step === "preview" ? <PreviewStep diff={diff} pending={pending} /> : null}
        {step === "confirm" && diff ? <ConfirmStep diff={diff} /> : null}
        {step === "result" ? <ResultStep summary={summary} pending={pending} /> : null}

        <DialogFooter>
          <StepFooter
            step={step}
            diff={diff}
            pending={pending}
            onBack={() => setStep(step === "confirm" ? "preview" : "select")}
            onContinue={() => setStep("confirm")}
            onConfirm={onConfirm}
            onClose={close}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Pasos de importación">
      {STEP_ORDER.map((step, index) => (
        <li key={step} aria-current={step === current ? "step" : undefined} className={cn(
          "rounded-full px-2 py-0.5",
          index < currentIndex ? "text-foreground" : index === currentIndex ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
        )}>
          {index + 1}. {STEP_LABELS[step]}
        </li>
      ))}
    </ol>
  );
}

function SelectStep({
  onSelect,
  fileInputRef,
}: {
  onSelect: (file: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm text-muted-foreground">Sube un archivo .csv (UTF-8) con los encabezados requeridos.</p>
      <Button onClick={() => fileInputRef.current?.click()} data-testid="csv-select-file">Selecciona archivo</Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        data-testid="csv-file-input"
        onChange={(event) => { onSelect(event.target.files?.[0] ?? null); event.target.value = ""; }}
      />
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent([...CSV_COLUMNS].join(",") + "\r\n")}`}
        download="plantilla-productos.csv"
        className="text-xs text-muted-foreground underline"
      >
        Descargar plantilla CSV
      </a>
    </div>
  );
}

function PreviewStep({ diff, pending }: { diff: ImportDiff | null; pending: boolean }) {
  if (pending || !diff) {
    return <p className="py-8 text-center text-sm text-muted-foreground" role="status">Analizando archivo…</p>;
  }
  return (
    <div className="flex flex-col gap-3" role="region" aria-label="Vista previa de importación">
      <div className="flex gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">Crear: {diff.createCount}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">Actualizar: {diff.updateCount}</span>
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 tabular-nums text-destructive">Con errores: {diff.errorCount}</span>
      </div>
      <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
            <tr><th className="px-2 py-1">#</th><th className="px-2 py-1">SKU</th><th className="px-2 py-1">Nombre</th><th className="px-2 py-1">Acción</th><th className="px-2 py-1">Detalle</th></tr>
          </thead>
          <tbody>
            {diff.rows.map((row) => (
              <tr key={row.line} className={cn("border-b border-border last:border-0", row.action === "error" && "bg-destructive/5")}>
                <td className="px-2 py-1 tabular-nums">{row.line}</td>
                <td className="px-2 py-1 font-mono">{row.sku || "—"}</td>
                <td className="px-2 py-1">{row.name || "—"}</td>
                <td className="px-2 py-1">{row.action === "create" ? "Crear" : row.action === "update" ? "Actualizar" : "Error"}</td>
                <td className="px-2 py-1 text-muted-foreground">{row.action === "error" ? row.message : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground" role="note">No se escribirá nada hasta que confirmes.</p>
    </div>
  );
}

function ConfirmStep({ diff }: { diff: ImportDiff }) {
  return (
    <p className="py-6 text-sm">
      Se crearán <strong>{diff.createCount}</strong> y se actualizarán <strong>{diff.updateCount}</strong> productos.{" "}
      {diff.errorCount > 0 ? <>Se omitirán <strong>{diff.errorCount}</strong> filas con errores.</> : null}
    </p>
  );
}

function ResultStep({ summary, pending }: { summary: ImportWriteResult | null; pending: boolean }) {
  if (pending || !summary) {
    return <p className="py-8 text-center text-sm text-muted-foreground" role="status">Importando…</p>;
  }
  return (
    <div className="flex flex-col gap-2 py-4" data-testid="csv-result">
      <p className="text-sm tabular-nums">
        Creados: {summary.created} · Actualizados: {summary.updated} · Con errores: {summary.failed.length}
      </p>
      {summary.failed.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto text-xs text-destructive">
          {summary.failed.map((row) => (
            <li key={row.sku}>{row.sku}: {row.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StepFooter({
  step, diff, pending, onBack, onContinue, onConfirm, onClose,
}: {
  step: Step;
  diff: ImportDiff | null;
  pending: boolean;
  onBack: () => void;
  onContinue: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (step === "select") {
    return <Button variant="ghost" onClick={onClose}>Cancelar</Button>;
  }
  if (step === "preview") {
    const validCount = diff ? diff.createCount + diff.updateCount : 0;
    return (
      <>
        <Button variant="ghost" onClick={onBack} disabled={pending}>Atrás</Button>
        <Button onClick={onContinue} disabled={pending || validCount === 0} data-testid="csv-continue">Continuar</Button>
      </>
    );
  }
  if (step === "confirm") {
    const validCount = diff ? diff.createCount + diff.updateCount : 0;
    return (
      <>
        <Button variant="ghost" onClick={onBack} disabled={pending}>Atrás</Button>
        <Button onClick={onConfirm} disabled={pending} data-testid="csv-confirm">Importar {validCount} productos</Button>
      </>
    );
  }
  return <Button onClick={onClose} disabled={pending} data-testid="csv-close">Cerrar</Button>;
}

"use server";

/**
 * CSV import server actions (T11 Slice 7). The dry-run parses the uploaded text
 * server-side and returns the diff (ZERO writes). The confirm RE-PARSES the same
 * text server-side (never trusts a client-passed plan) and applies only the
 * valid rows resiliently. Both re-verify the session. Row-cap + empty + bad-
 * header + size are rejected with a clear message and zero writes.
 */
import { requireSession } from "@/lib/admin/require-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/admin/csv/csv-parse";
import {
  buildImportDiff,
  type ImportContext,
  type ImportDiff,
} from "@/lib/admin/csv/csv-product-map";
import { applyImport, type ImportWriteResult } from "@/lib/admin/csv/csv-import-write";
import { CSV_MAX_ROWS, CSV_MAX_BYTES } from "@/lib/config";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Dry-run outcome. */
export type DryRunResult = { ok: true; diff: ImportDiff } | { ok: false; message: string };

/** Confirm outcome. */
export type ConfirmResult = { ok: true; summary: ImportWriteResult } | { ok: false; message: string };

/** Validate the file + return its UTF-8 text, or a rejection message. */
async function readCsvText(file: File): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > CSV_MAX_BYTES) return { ok: false, message: "El archivo es demasiado grande." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text };
  } catch {
    return { ok: false, message: "El archivo no es UTF-8 válido." };
  }
}

/** Load the existing SKUs + taxonomy slug sets for the diff. */
async function loadContext(db: AdminClient): Promise<ImportContext> {
  const [products, brands, styles, categories] = await Promise.all([
    db.from("products").select("sku"),
    db.from("brands").select("slug"),
    db.from("styles").select("slug"),
    db.from("categories").select("slug"),
  ]);
  return {
    existingSkus: new Set((products.data ?? []).map((row) => row.sku)),
    brandSlugs: new Set((brands.data ?? []).map((row) => row.slug)),
    styleSlugs: new Set((styles.data ?? []).map((row) => row.slug)),
    categorySlugs: new Set((categories.data ?? []).map((row) => row.slug)),
  };
}

/** Parse + bound the CSV; shared by dry-run and confirm. */
async function parseAndDiff(
  formData: FormData,
): Promise<{ ok: true; diff: ImportDiff } | { ok: false; message: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Selecciona un archivo CSV." };

  const read = await readCsvText(file);
  if (!read.ok) return read;

  const rows = parseCsv(read.text);
  if (rows.length <= 1) return { ok: false, message: "El archivo no tiene filas de datos." };
  if (rows.length - 1 > CSV_MAX_ROWS) {
    return { ok: false, message: `El archivo excede ${CSV_MAX_ROWS} filas.` };
  }

  const db = createAdminClient();
  const context = await loadContext(db);
  const diff = buildImportDiff(rows, context);
  if ("error" in diff) return { ok: false, message: diff.error };
  return { ok: true, diff };
}

/** Dry-run: parse + build the diff. ZERO writes (AC-30). */
export async function dryRunImportAction(formData: FormData): Promise<DryRunResult> {
  await requireSession();
  return parseAndDiff(formData);
}

/** Confirm: re-parse server-side and apply the valid rows resiliently (AC-31). */
export async function confirmImportAction(formData: FormData): Promise<ConfirmResult> {
  await requireSession();
  const parsed = await parseAndDiff(formData);
  if (!parsed.ok) return parsed;

  const validRows = parsed.diff.rows
    .filter((row) => row.action !== "error")
    .map((row) => (row as Extract<typeof row, { action: "create" | "update" }>).values);

  if (validRows.length === 0) {
    return { ok: false, message: "No hay filas válidas para importar." };
  }
  const summary = await applyImport(validRows);
  return { ok: true, summary };
}

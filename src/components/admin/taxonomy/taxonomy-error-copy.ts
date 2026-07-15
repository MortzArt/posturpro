/**
 * es-MX copy for taxonomy field errors + write outcomes (T11 Slice 5).
 */
import type { TaxonomyFieldError } from "@/lib/admin/taxonomy/taxonomy-input";

export const TAXONOMY_FIELD_ERROR_COPY: Record<TaxonomyFieldError, string> = {
  "name-required": "Ingresa un nombre.",
  "name-too-long": "El nombre es demasiado largo.",
  "slug-required": "Ingresa un slug.",
  "slug-format": "Usa minúsculas y guiones, sin espacios.",
  "slug-duplicate": "Ya existe un registro con ese slug.",
  "description-too-long": "La descripción es demasiado larga.",
  cycle: "Una categoría no puede ser su propio ancestro.",
  "logo-url-invalid": "Ingresa una URL válida (http/https).",
};

export const TAXONOMY_RESTRICT_MESSAGE =
  "Reasigna o elimina las subcategorías primero.";
export const TAXONOMY_WRITE_FAILED_MESSAGE = "No se pudo guardar. Intenta de nuevo.";

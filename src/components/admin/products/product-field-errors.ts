/**
 * es-MX copy for every product field-error key (T11 Slice 2). Kept separate from
 * the form component so both the form and (later) tests reference one source.
 */
import {
  PRODUCT_NAME_MAX_LENGTH,
  MATERIAL_MAX_LENGTH,
} from "@/lib/config";
import type { ProductFieldErrorKey } from "@/lib/admin/products/product-input";

export const PRODUCT_FIELD_ERROR_MESSAGES: Record<ProductFieldErrorKey, string> = {
  required: "Este campo es obligatorio.",
  "too-long": `Máximo ${MATERIAL_MAX_LENGTH} caracteres (nombre: ${PRODUCT_NAME_MAX_LENGTH}).`,
  "slug-format": "Usa minúsculas y guiones, sin espacios (p. ej. silla-ergo-pro).",
  "slug-duplicate": "Ya existe un producto con ese slug.",
  "sku-duplicate": "Ya existe un producto con ese SKU.",
  "money-required": "Ingresa un precio.",
  "money-invalid": "Usa punto decimal, sin separadores de miles.",
  "money-negative": "El monto no puede ser negativo.",
  "money-too-many-decimals": "Usa máximo 2 decimales.",
  "money-overflow": "El monto es demasiado grande.",
  "int-invalid": "Ingresa un número entero válido.",
  "int-negative": "No puede ser negativo.",
  "unit-invalid": "Usa punto decimal, sin separadores de miles.",
  "unit-negative": "No puede ser negativo.",
  "unit-too-many-decimals": "Usa máximo 2 decimales.",
  "unit-overflow": "El valor es demasiado grande.",
  "status-invalid": "Estado inválido.",
};

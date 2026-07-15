import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * EditPageBanner (T11 Slice 2/6) — the one-time success banner shown when the
 * create/duplicate action redirects to `[id]/edit?created` / `?duplicated`.
 * Server component (static content). `role="status"`, `.enter-fade`.
 */
export function EditPageBanner({ kind }: { kind: "created" | "duplicated" }) {
  const message =
    kind === "duplicated"
      ? "Producto duplicado. Revisa y publícalo."
      : "Producto creado. Agrega imágenes y variantes.";
  return (
    <div
      role="status"
      data-testid="admin-product-created-banner"
      className="enter-fade mb-6 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm"
    >
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={16}
        strokeWidth={2}
        aria-hidden
        className="mt-0.5 shrink-0"
      />
      <span>{message}</span>
    </div>
  );
}

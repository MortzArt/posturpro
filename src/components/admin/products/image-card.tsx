"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DragDropVerticalIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { EditImage, EditVariant } from "@/lib/admin/products/product-read";

/**
 * ImageCard — one tile in the admin `ImageManager` grid: drag handle, preview,
 * cover radio, optional colour picker, and move/delete controls. Presentational;
 * every mutation is a callback into the manager, which owns optimistic state.
 *
 * The colour picker binds the image to one variant (`variantId`) or to every
 * colour (`null`, "Todos"). The storefront gallery leads with the
 * selected colour's images and follows with the shared ones.
 */

/** Sentinel `<option>` value for "shared across all colours" (variantId null). */
const ALL_COLORS_VALUE = "";

interface ImageCardProps {
  image: EditImage;
  index: number;
  total: number;
  isDragging: boolean;
  offsetY: number;
  variants: EditVariant[];
  onPointerDownHandle: (event: React.PointerEvent) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChooseCover: () => void;
  onChangeColor: (variantId: string | null) => void;
  onDelete: () => void;
}

export function ImageCard({
  image, index, total, isDragging, offsetY, variants,
  onPointerDownHandle, onMoveUp, onMoveDown, onChooseCover, onChangeColor, onDelete,
}: ImageCardProps) {
  return (
    <div
      className={cn(
        "reorder-item relative flex w-28 flex-col gap-1 rounded-md border border-border p-1.5 sm:w-32",
        image.isPrimary && "ring-2 ring-ring",
        isDragging && "z-10 opacity-95 shadow-lg",
      )}
      style={isDragging ? { transform: `translateY(${offsetY}px) scale(1.03)`, transition: "none" } : undefined}
      data-testid={`admin-image-card-${image.id}`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Reordenar (arrastra o usa las flechas)"
          onPointerDown={onPointerDownHandle}
          className="inline-flex size-9 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:size-8"
          style={{ touchAction: "none" }}
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} size={16} strokeWidth={2} aria-hidden />
        </button>
        {image.isPrimary ? (
          <HugeiconsIcon icon={StarIcon} size={13} strokeWidth={2} aria-hidden className="text-foreground" />
        ) : null}
      </div>
      <Image src={image.url} alt="" width={128} height={96} className="h-20 w-full rounded-sm bg-muted object-cover" />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="radio"
          name="cover"
          checked={image.isPrimary}
          onChange={onChooseCover}
          data-testid={`admin-image-cover-${image.id}`}
          className="size-3 accent-primary"
        />
        Portada
      </label>
      {variants.length > 0 ? (
        <ColorPicker image={image} variants={variants} onChange={onChangeColor} />
      ) : null}
      <div className="flex items-center justify-between">
        <div className="flex gap-0.5">
          <IconButton label="Subir imagen" disabled={index === 0} onClick={onMoveUp} icon={ArrowUp01Icon} testid={`admin-image-up-${image.id}`} />
          <IconButton label="Bajar imagen" disabled={index === total - 1} onClick={onMoveDown} icon={ArrowDown01Icon} testid={`admin-image-down-${image.id}`} />
        </div>
        <IconButton label="Eliminar imagen" onClick={onDelete} icon={Delete02Icon} testid={`admin-image-delete-${image.id}`} destructive />
      </div>
    </div>
  );
}

function ColorPicker({
  image,
  variants,
  onChange,
}: {
  image: EditImage;
  variants: EditVariant[];
  onChange: (variantId: string | null) => void;
}) {
  // A stale binding (variant deleted) falls back to "all colours" in the UI.
  const bound = variants.some((variant) => variant.id === image.variantId)
    ? (image.variantId ?? ALL_COLORS_VALUE)
    : ALL_COLORS_VALUE;
  return (
    <select
      aria-label="Color de la imagen"
      value={bound}
      onChange={(event) => onChange(event.target.value === ALL_COLORS_VALUE ? null : event.target.value)}
      data-testid={`admin-image-variant-${image.id}`}
      className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <option value={ALL_COLORS_VALUE}>Todos</option>
      {variants.map((variant) => (
        <option key={variant.id} value={variant.id}>
          {variant.colorName}
        </option>
      ))}
    </select>
  );
}

function IconButton({
  label, onClick, icon, testid, disabled, destructive,
}: {
  label: string;
  onClick: () => void;
  icon: typeof ArrowUp01Icon;
  testid: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-30 sm:size-8",
        destructive && "hover:text-destructive",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

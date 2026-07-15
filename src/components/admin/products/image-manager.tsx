"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UploadCircle02Icon,
  DragDropVerticalIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
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
import { Banner } from "@/components/admin/form/fields";
import { usePointerReorder } from "@/hooks/use-pointer-reorder";
import {
  uploadImageAction,
  reorderImagesAction,
  setCoverAction,
  deleteImageAction,
} from "@/app/admin/(app)/products/image-actions";
import {
  PRODUCT_IMAGE_MIME_TYPES,
  IMAGE_MAX_BYTES,
} from "@/lib/config";
import { cn } from "@/lib/utils";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import type { EditImage } from "@/lib/admin/products/product-read";

/**
 * ImageManager (T11 Slice 3, AC-14..17) — dropzone + drag-order grid + cover
 * radiogroup + delete. Native Pointer Events drag with a keyboard ↑/↓ fallback
 * (the guaranteed a11y path). Optimistic order/cover reconciled on the server
 * response. Server re-validates every upload. Section within the edit form.
 */
const CARD_HEIGHT_PX = 160;

export function ImageManager({
  productId,
  initialImages,
}: {
  productId: string;
  initialImages: EditImage[];
}) {
  const [images, setImages] = useState<EditImage[]>(initialImages);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EditImage | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const persistOrder = (orderedIds: string[]): void => {
    setImages((prev) => orderedIds.map((id) => prev.find((img) => img.id === id)).filter(isImage));
    startTransition(async () => {
      const result = await reorderImagesAction(productId, orderedIds);
      if (!result.ok) {
        setError("No se pudo guardar el orden. Recarga e intenta de nuevo.");
      }
    });
  };

  const ids = images.map((image) => image.id);
  const reorder = usePointerReorder(ids, CARD_HEIGHT_PX, persistOrder);

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    if (liveRef.current) {
      liveRef.current.textContent = `Imagen movida a la posición ${target + 1} de ${next.length}.`;
    }
    persistOrder(next.map((image) => image.id));
  };

  const onFiles = (files: FileList | null): void => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      const invalid = validateClient(file);
      if (invalid) {
        setError(invalid);
        continue;
      }
      uploadOne(file);
    }
  };

  const uploadOne = (file: File): void => {
    setUploading((count) => count + 1);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadImageAction(productId, formData);
      setUploading((count) => count - 1);
      if (result.ok) {
        setImages((prev) => [
          ...prev,
          { id: result.id, url: result.url, variantId: null, sortOrder: result.sortOrder, isPrimary: result.isPrimary },
        ]);
      } else {
        setError(uploadErrorMessage(result.reason));
      }
    });
  };

  const chooseCover = (imageId: string): void => {
    setImages((prev) => prev.map((image) => ({ ...image, isPrimary: image.id === imageId })));
    startTransition(async () => {
      const result = await setCoverAction(productId, imageId);
      if (!result.ok) setError("No se pudo cambiar la portada.");
    });
  };

  const confirmDelete = (): void => {
    const image = pendingDelete;
    if (!image) return;
    setPendingDelete(null);
    setImages((prev) => reconcileCoverAfterDelete(prev.filter((img) => img.id !== image.id), image));
    startTransition(async () => {
      const result = await deleteImageAction(productId, image.id);
      if (!result.ok) setError("No se pudo eliminar la imagen.");
    });
  };

  return (
    <fieldset id="imagenes" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold tracking-tight">Imágenes</legend>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); onFiles(event.dataTransfer.files); }}
        data-testid="admin-image-dropzone"
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-ring bg-muted/50" : "border-border bg-muted/20",
        )}
      >
        <HugeiconsIcon icon={UploadCircle02Icon} size={20} strokeWidth={2} aria-hidden className="text-muted-foreground" />
        <span className="text-sm">{dragOver ? "Suelta para subir" : "Arrastra imágenes o selecciona archivos"}</span>
        <span className="text-xs text-muted-foreground">JPG, PNG o WebP · máx 5 MB c/u</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={PRODUCT_IMAGE_MIME_TYPES.join(",")}
        className="sr-only"
        data-testid="admin-image-input"
        onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }}
      />

      {error ? <Banner role="alert" tone="error" icon={Alert02Icon} message={error} testid="admin-image-error" /> : null}

      {images.length > 0 ? (
        <div role="radiogroup" aria-label="Imagen de portada" className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              index={index}
              total={images.length}
              isDragging={reorder.draggingId === image.id}
              offsetY={reorder.draggingId === image.id ? reorder.offsetY : 0}
              onPointerDownHandle={(event) => reorder.onHandlePointerDown(event, image.id)}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onChooseCover={() => chooseCover(image.id)}
              onDelete={() => setPendingDelete(image)}
            />
          ))}
        </div>
      ) : null}

      {uploading > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          Subiendo {uploading} {uploading === 1 ? "imagen" : "imágenes"}…
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Una sola portada. Se muestra primero en la tienda.</p>
      <p ref={liveRef} aria-live="polite" className="sr-only" />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="dialog-content-motion" data-testid="admin-image-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar imagen?</AlertDialogTitle>
            <AlertDialogDescription>Se quitará de este producto. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="admin-image-delete-confirm">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}

/** Type guard for filtering out undefined during optimistic reorder. */
function isImage(value: EditImage | undefined): value is EditImage {
  return value !== undefined;
}

/** After deleting the cover, promote the first remaining image (UI mirror). */
function reconcileCoverAfterDelete(remaining: EditImage[], deleted: EditImage): EditImage[] {
  if (!deleted.isPrimary || remaining.length === 0) return remaining;
  return remaining.map((image, index) => ({ ...image, isPrimary: index === 0 }));
}

/** Client pre-validation (server re-validates). */
function validateClient(file: File): string | null {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_MIME_TYPES)[number])) {
    return "Formato no permitido (usa JPG/PNG/WebP).";
  }
  if (file.size > IMAGE_MAX_BYTES) return "La imagen supera 5 MB.";
  return null;
}

function uploadErrorMessage(reason: string): string {
  if (reason === "bad-type") return "Formato no permitido (usa JPG/PNG/WebP).";
  if (reason === "too-large") return "La imagen supera 5 MB.";
  return "No se pudo subir la imagen. Intenta de nuevo.";
}

interface ImageCardProps {
  image: EditImage;
  index: number;
  total: number;
  isDragging: boolean;
  offsetY: number;
  onPointerDownHandle: (event: React.PointerEvent) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChooseCover: () => void;
  onDelete: () => void;
}

function ImageCard({
  image, index, total, isDragging, offsetY,
  onPointerDownHandle, onMoveUp, onMoveDown, onChooseCover, onDelete,
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
          className="cursor-grab touch-none text-muted-foreground"
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
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30",
        destructive && "hover:text-destructive",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} strokeWidth={2} aria-hidden />
    </button>
  );
}

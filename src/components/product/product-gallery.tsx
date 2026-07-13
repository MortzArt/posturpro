"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Image01Icon,
  ZoomInAreaIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/interpolate";
import type { ProductImageView } from "@/lib/catalog/product-detail.types";

/**
 * ProductGallery (T4 AC-5, AC-6, AC-18, edges 1 & 8) — main image + thumbnail
 * rail + zoom lightbox (raw Radix Dialog for free focus trap / Escape / backdrop
 * dismiss / aria-modal / focus-return, no new dep). Receives the image set for
 * the currently-selected variant (the panel resolves it). On an `images` change
 * the active index resets to 0 (clamped), so a variant switch never leaves a
 * stuck frame (edge 8). Main-image swap crossfades via the `.gallery-image` key.
 */

interface GalleryLabels {
  imagePlaceholder: string;
  zoom: string;
  close: string;
  /** Template with a `{number}` token, interpolated per-thumb client-side. */
  thumbnailAltTemplate: string;
  regionLabel: string;
}

interface ProductGalleryProps {
  images: ProductImageView[];
  productName: string;
  labels: GalleryLabels;
}

const MAIN_SIZES = "(max-width: 1024px) 100vw, 50vw" as const;
const THUMB_SIZES = "64px" as const;

export function ProductGallery({
  images,
  productName,
  labels,
}: ProductGalleryProps) {
  // `activeIndex` resets to 0 on a variant switch because the PARENT keys this
  // component on the selected variant id, remounting it with a fresh index — so
  // the gallery never shows a stuck frame from the previous variant (edge 8)
  // without a reset effect or a during-render ref write.
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  if (images.length === 0) {
    return <GalleryPlaceholder name={productName} label={labels.imagePlaceholder} />;
  }

  const safeIndex = activeIndex < images.length ? activeIndex : 0;
  const active = images[safeIndex];
  const activeAlt = active.altText?.trim() ? active.altText : productName;

  return (
    <section aria-label={labels.regionLabel} data-testid="product-gallery">
      <Dialog.Root open={zoomOpen} onOpenChange={setZoomOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label={labels.zoom}
            data-testid="gallery-zoom-trigger"
            className="gallery-zoom-trigger group/main relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <GalleryImage
              key={active.id}
              src={active.url}
              alt={activeAlt}
              priority
              placeholderLabel={labels.imagePlaceholder}
              productName={productName}
            />
            <span
              aria-hidden
              className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover/main:opacity-100 group-focus-visible/main:opacity-100"
            >
              <HugeiconsIcon icon={ZoomInAreaIcon} size={16} strokeWidth={2} />
            </span>
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="gallery-zoom-scrim fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content
            aria-label={activeAlt}
            data-testid="gallery-zoom-dialog"
            className="gallery-zoom-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 items-center justify-center outline-none"
          >
            <Dialog.Title className="sr-only">{activeAlt}</Dialog.Title>
            <div className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center">
              {/* Full-res image in the lightbox — intrinsic sizing, not fill. */}
              <Image
                src={active.url}
                alt={activeAlt}
                width={1200}
                height={1500}
                sizes="90vw"
                className="h-auto max-h-[90vh] w-auto max-w-[90vw] rounded-lg object-contain"
              />
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={labels.close}
                data-testid="gallery-zoom-close"
                className="gallery-zoom-trigger absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full bg-background/90 text-foreground outline-none backdrop-blur-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={2} aria-hidden />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {images.length > 1 ? (
        <ul
          className="mt-3 flex flex-wrap gap-2 overflow-x-auto"
          data-testid="gallery-thumbnails"
        >
          {images.map((image, index) => {
            const isActive = index === safeIndex;
            const thumbAlt = image.altText?.trim() ? image.altText : productName;
            return (
              <li key={image.id} className="shrink-0">
                <button
                  type="button"
                  aria-label={interpolate(labels.thumbnailAltTemplate, {
                    number: index + 1,
                  })}
                  aria-pressed={isActive}
                  onClick={() => setActiveIndex(index)}
                  data-testid={`gallery-thumb-${index}`}
                  className={cn(
                    "relative block size-16 overflow-hidden rounded-md border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "thumb-hover",
                  )}
                >
                  <Image
                    src={image.url}
                    alt={thumbAlt}
                    fill
                    sizes={THUMB_SIZES}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The active main image with an `onError` fallback to the placeholder tile, so a
 * failed load never renders a broken `<img>` (error-states table). Keyed by the
 * caller on `active.id` so a swap crossfades via `.gallery-image`.
 */
function GalleryImage({
  src,
  alt,
  priority,
  placeholderLabel,
  productName,
}: {
  src: string;
  alt: string;
  priority: boolean;
  placeholderLabel: string;
  productName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <PlaceholderFill name={productName} label={placeholderLabel} />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={MAIN_SIZES}
      priority={priority}
      onError={() => setFailed(true)}
      className="gallery-image size-full object-cover"
    />
  );
}

/** The zero-image gallery tile (AC-5, edge 1) — labeled, no zoom affordance. */
function GalleryPlaceholder({ name, label }: { name: string; label: string }) {
  return (
    <section aria-label={label} data-testid="product-gallery">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <PlaceholderFill name={name} label={label} />
      </div>
    </section>
  );
}

/** The centered placeholder icon fill, shared by the empty + error states. */
function PlaceholderFill({ name, label }: { name: string; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${name} — ${label}`}
      className="flex size-full items-center justify-center text-muted-foreground"
    >
      <HugeiconsIcon icon={Image01Icon} size={40} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

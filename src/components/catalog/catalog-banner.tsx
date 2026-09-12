import Image from "next/image";
import { CATALOG_BANNER_BACKDROP } from "@/lib/config";
import { HugeiconsIcon } from "@hugeicons/react";
import { Chair01Icon } from "@hugeicons/core-free-icons";

/**
 * CatalogBanner (T15 AC-8, Casa de Azulejo) — the `/sillas` index art slot: a
 * wide framed cartouche (42/9) that opens the tile wall, per DESIGN.md
 * "Catalog / PLP → index tiles are framed painted panels". Purely decorative
 * (no overlaid copy, so no scrim/contrast concern — edge 5 N/A), config-driven
 * via `CATALOG_BANNER_IMAGE`.
 *
 * Image-slot grammar mirrors `Hero`/`EditorialBand`: `next/image` inside the
 * reserved 42/9 aspect box; the artwork is CONTAINED on a backdrop matching its ground
 * colour, then zoomed 20% (owner request 2026-09-12) — the frame clips only the poster's
 * empty top/bottom margins, never the chairs or slogan + cobalt cartouche frame when `imageUrl` is set, else
 * a token-styled blank cobalt tile with a centered chair glyph — never a broken
 * `<img>`, zero CLS either way (edge 3). NOT the LCP (it sits above the grid but
 * below the page header/breadcrumbs), so `next/image` is lazy (no `priority`).
 * The alt string is pre-resolved by the RSC and passed in.
 */

interface CatalogBannerProps {
  imageUrl: string | null;
  imageAlt: string;
}

export function CatalogBanner({ imageUrl, imageAlt }: CatalogBannerProps) {
  return (
    <div
      className="enter-fade relative mb-6 aspect-[42/9] w-full overflow-hidden rounded-md bg-muted shadow-sm md:mb-8"
      style={
        imageUrl ? { backgroundColor: CATALOG_BANNER_BACKDROP } : undefined
      }
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(min-width: 1280px) 1152px, 100vw"
          className="scale-[1.2] object-contain"
        />
      ) : (
        <span
          aria-hidden
          data-testid="catalog-banner-fallback"
          className="flex h-full w-full items-center justify-center"
        >
          <HugeiconsIcon
            icon={Chair01Icon}
            size={72}
            strokeWidth={1.5}
            className="text-muted-foreground/40"
          />
        </span>
      )}
    </div>
  );
}

import Image from "next/image";
import { cn } from "@/lib/utils";
import { CATALOG_BANNER_ASPECT } from "@/lib/config";
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
 * reserved aspect box (`CATALOG_BANNER_ASPECT`, matches the artwork so the baked-in slogan is never cropped) + cobalt cartouche frame when `imageUrl` is set, else
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
      className={cn(
        "enter-fade relative mb-6 w-full overflow-hidden rounded-md bg-muted shadow-sm md:mb-8",
        CATALOG_BANNER_ASPECT,
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(min-width: 1280px) 1152px, 100vw"
          className="object-cover"
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

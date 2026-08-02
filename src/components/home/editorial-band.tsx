import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Chair01Icon } from "@hugeicons/core-free-icons";

/**
 * EditorialBand (T15 AC-8) — the homepage ergonomics editorial band. A wide
 * cartouche lifestyle slot with a cobalt caption bar carrying a short
 * posture-authority claim + subcopy. This is a curation/ergonomics claim, NOT
 * proof — no testimonials, customer counts, review numbers, or stats (AC-9).
 *
 * Image-slot grammar mirrors `HeroMedia`: `next/image` when `imageUrl` is set
 * (inside the reserved 16/9 → 21/9 aspect box + cartouche frame), else a
 * token-styled blank cobalt tile with a centered chair glyph — never a broken
 * `<img>`, zero CLS either way (edge 3). Strings are pre-resolved by the RSC and
 * passed in (pre-resolved-labels discipline). Mounts with the shipped
 * `.enter-fade` (opacity + rise, ease-out, reduced-motion → opacity-only).
 *
 * The cobalt caption bar (`bg-primary text-primary-foreground`) doubles as the
 * AA scrim (8.37:1) for the overlaid copy, so contrast holds regardless of the
 * underlying photo's luminance (edge 5).
 */

interface EditorialBandProps {
  title: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string;
}

export function EditorialBand({
  title,
  body,
  imageUrl,
  imageAlt,
}: EditorialBandProps) {
  return (
    <div className="enter-fade overflow-hidden rounded-md border border-primary/30 bg-card shadow-sm">
      <div className="relative aspect-[16/9] w-full bg-muted lg:aspect-[21/9]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            data-testid="editorial-band-fallback"
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

      <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-8 sm:py-6">
        <h2 className="text-balance font-heading text-2xl font-bold tracking-wide sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-primary-foreground/90 sm:text-base">
          {body}
        </p>
      </div>
    </div>
  );
}

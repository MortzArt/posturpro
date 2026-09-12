import Image from "next/image";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Chair01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Hero (T13 AC-7, AC-9) — the homepage front door. Editorial split: copy-left,
 * media-right on `lg`; stacked copy → CTA → media on mobile. ALWAYS renders.
 *
 * Placeholder-imagery strategy: the media column renders `next/image` from
 * `imageUrl` when present; when `null`, it degrades to a token-tinted panel with
 * a centered chair glyph (`aria-hidden`) — never a broken `<img>`, never layout
 * collapse. Mount uses the shipped `.enter-fade` (opacity + rise, `ease-out`,
 * reduced-motion → opacity-only); the secondary link reuses `.link-arrow`.
 */

interface HeroProps {
  headline: string;
  subcopy: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  imageUrl: string | null;
  imageAlt: string;
  /**
   * Blank-tile glyph shown when `imageUrl` is null. Defaults to the chair glyph
   * (homepage); the B2B page passes a building glyph so the fallback reads
   * "offices", not "single product".
   */
  fallbackIcon?: IconSvgElement;
}

export function Hero({
  headline,
  subcopy,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  imageUrl,
  imageAlt,
  fallbackIcon = Chair01Icon,
}: HeroProps) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="enter-fade order-1 flex max-w-xl flex-col gap-4">
        <h1 className="text-balance font-heading text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
          {headline}
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          {subcopy}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {/* Primary CTA is the orange Factorial pill (AC-EMP-2: matches the
              homepage hero grammar — --cta orange token, xl pill, not green). */}
          <Button asChild variant="cta" size="xl">
            <Link href={ctaHref} data-testid="hero-cta-catalog">
              {ctaLabel}
            </Link>
          </Button>
          <Link
            href={secondaryHref}
            data-testid="hero-link-brands"
            className="nav-hover group/brands inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {secondaryLabel}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={2}
              aria-hidden
              className="link-arrow"
            />
          </Link>
        </div>
      </div>

      <HeroMedia
        imageUrl={imageUrl}
        imageAlt={imageAlt}
        fallbackIcon={fallbackIcon}
      />
    </div>
  );
}

/** The hero media column: real image, or a token-tinted glyph panel. */
function HeroMedia({
  imageUrl,
  imageAlt,
  fallbackIcon,
}: {
  imageUrl: string | null;
  imageAlt: string;
  fallbackIcon: IconSvgElement;
}) {
  // A white floating media card with no tint canvas frame (matching HomeHero;
  // the mint frame was retired 2026-09-12). The card keeps `aspect-[4/3]` on
  // BOTH the image and the fallback tile (hero.test.tsx pins).
  if (imageUrl) {
    return (
      <span className="factorial-card relative order-2 block aspect-[4/3] w-full overflow-hidden rounded-md">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      data-testid="hero-image-fallback"
      className="factorial-card order-2 flex aspect-[4/3] w-full items-center justify-center rounded-md"
    >
      <HugeiconsIcon
        icon={fallbackIcon}
        size={72}
        strokeWidth={1.5}
        className="text-muted-foreground/40"
      />
    </span>
  );
}

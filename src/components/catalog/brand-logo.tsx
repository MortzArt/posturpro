import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * BrandLogo (T3 AC-4, edge case 5) — a brand's `logo_url` image, or a
 * typographic monogram fallback when null. All 5 seeded brands have a null
 * logo, so the fallback is the common path. Server component.
 *
 * When falling back, the monogram tile is `aria-hidden` (decorative) — the
 * real brand name is always rendered as text beside/under it by the caller, so
 * the identity is never conveyed by the tile alone.
 */

interface BrandLogoProps {
  name: string;
  logoUrl: string | null;
  /** Pre-resolved alt text for a real logo image ("Logo de {brand}"). */
  logoAlt?: string;
  size?: "sm" | "lg";
  className?: string;
}

const SIZE_BOX = {
  sm: "size-10",
  lg: "size-16 md:size-20",
} as const;

const SIZE_PX = {
  sm: 40,
  lg: 80,
} as const;

const SIZE_TEXT = {
  sm: "text-sm",
  lg: "text-xl md:text-2xl",
} as const;

/** First two letters of the brand as a monogram (uppercased). */
function monogram(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

export function BrandLogo({
  name,
  logoUrl,
  logoAlt,
  size = "sm",
  className,
}: BrandLogoProps) {
  if (logoUrl) {
    return (
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md border border-border bg-card",
          SIZE_BOX[size],
          className,
        )}
      >
        <Image
          src={logoUrl}
          alt={logoAlt ?? name}
          width={SIZE_PX[size]}
          height={SIZE_PX[size]}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold tracking-tight text-foreground",
        SIZE_BOX[size],
        SIZE_TEXT[size],
        className,
      )}
    >
      {monogram(name)}
    </span>
  );
}

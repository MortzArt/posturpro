import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, EMPRESAS_PATH } from "@/lib/config";

/**
 * CtaBanner (T20 Factorial grammar) — the closing conversion banner: a radius-32
 * gradient banner card (the second and only other gradient moment besides the
 * calculator band, AC-7) inset on white, with ink text and two CTAs — orange
 * pill primary (catalog) + 2px ink-outline pill secondary (business quote). Both
 * full-width stacked on mobile. Content enters with `.enter-fade`. Ink over the
 * lightest gradient stop ≈10:1 (AA PASS); the default green focus ring now reads
 * on the pastel band, so the old white-ring overrides are removed.
 *
 * Optional `imageUrl` (owner request 2026-09-12): a transparent-PNG chair trio
 * fills a LEFT column on `lg+` and the copy left-aligns beside it; on small
 * screens the image sits above the centred copy. `null` keeps the text-only
 * centred banner.
 */

interface CtaBannerProps {
  heading: string;
  cta1: string;
  cta2: string;
  imageUrl?: string | null;
  imageAlt?: string;
}

export function CtaBanner({
  heading,
  cta1,
  cta2,
  imageUrl = null,
  imageAlt = "",
}: CtaBannerProps) {
  const withImage = imageUrl !== null;
  return (
    <div
      className={cn(
        "enter-fade gradient-banner rounded-[2rem] px-6 py-14 text-center text-foreground sm:py-20",
        withImage &&
          "lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-center lg:gap-10 lg:px-12 lg:py-11 lg:text-left",
      )}
      data-testid="cta-banner"
    >
      {withImage ? (
        <div className="relative mx-auto mb-8 aspect-[541/500] w-full max-w-[200px] sm:max-w-[240px] lg:mb-0 lg:max-w-[270px]">
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(min-width: 1024px) 340px, 280px"
            className="object-contain"
          />
        </div>
      ) : null}
      <div>
        <h2
          className={cn(
            "mx-auto max-w-2xl text-balance font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2.5rem]",
            withImage && "lg:mx-0",
          )}
        >
          {heading}
        </h2>
        <div
          className={cn(
            "mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4",
            withImage && "lg:justify-start",
          )}
        >
          <Button
            asChild
            variant="cta"
            size="xl"
            className="w-full sm:w-auto"
            data-testid="cta-banner-catalog"
          >
            <Link href={CATALOG_PATH}>{cta1}</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="xl"
            className="pill-outline w-full sm:w-auto"
            data-testid="cta-banner-business"
          >
            <Link href={EMPRESAS_PATH}>{cta2}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

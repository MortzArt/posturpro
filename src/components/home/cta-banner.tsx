import { Link } from "@/i18n/navigation";
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
 */

interface CtaBannerProps {
  heading: string;
  cta1: string;
  cta2: string;
}

export function CtaBanner({ heading, cta1, cta2 }: CtaBannerProps) {
  return (
    <div
      className="enter-fade gradient-banner rounded-[2rem] px-6 py-14 text-center text-foreground sm:py-20"
      data-testid="cta-banner"
    >
      <h2 className="mx-auto max-w-2xl text-balance font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2.5rem]">
        {heading}
      </h2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
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
  );
}

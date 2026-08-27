import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, EMPRESAS_PATH } from "@/lib/config";

/**
 * CtaBanner (T19 D.10) — the closing conversion banner: a deep-green band (brand
 * identity payoff before the footer) with a heading and two CTAs — orange primary
 * (catalog) + mint secondary (business quote, 10.45:1 on green). Both full-width
 * stacked on mobile. Content enters with `.enter-fade`. Focus rings are white-ish
 * so they read on the green field.
 */

interface CtaBannerProps {
  heading: string;
  cta1: string;
  cta2: string;
}

export function CtaBanner({ heading, cta1, cta2 }: CtaBannerProps) {
  return (
    <div
      className="enter-fade rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground"
      data-testid="cta-banner"
    >
      <h2 className="mx-auto max-w-2xl text-balance font-heading text-3xl font-bold tracking-wide text-primary-foreground sm:text-4xl">
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
          variant="secondary"
          size="xl"
          className="w-full focus-visible:ring-primary-foreground/60 sm:w-auto"
          data-testid="cta-banner-business"
        >
          <Link href={EMPRESAS_PATH}>{cta2}</Link>
        </Button>
      </div>
    </div>
  );
}

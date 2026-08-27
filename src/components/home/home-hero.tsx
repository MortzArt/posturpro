import Image from "next/image";
import { Chair01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, EMPRESAS_PATH } from "@/lib/config";
import { HeroStats, type HeroStat } from "@/components/home/hero-stats";
import { CertTag } from "@/components/home/cert-tag";

/**
 * HomeHero (T19 D.1) — the homepage front door: eyebrow, 2-line headline, subcopy,
 * two CTAs (catalog = orange primary; business = mint secondary), a 3-figure stat
 * row, and a media slot with the cert-tag overlay. Distinct from the shared
 * `Hero` (still used by /empresas) because this variant has the stats + cert-tag
 * + dual-CTA hierarchy the mockup requires.
 *
 * Headline emphasis comes from the line BREAK, never orange — orange is reserved
 * for CTAs (AC-13). Media degrades to a token-tinted glyph tile when `imageUrl`
 * is null (AC-21). Motion reuses `.enter-fade` (copy) + `.stagger` is not needed
 * here; reduced motion is handled by the shared classes.
 */

interface HomeHeroProps {
  eyebrow: string;
  headlineL1: string;
  headlineL2: string;
  subtitle: string;
  ctaCatalog: string;
  ctaBusiness: string;
  imageUrl: string | null;
  imageAlt: string;
  stats: readonly [HeroStat, HeroStat, HeroStat];
  cert: { grade: string; code: string; meta: string };
  disclaimer: string;
}

export function HomeHero(props: HomeHeroProps) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="enter-fade order-1 flex max-w-xl flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {props.eyebrow}
        </p>
        <h1 className="text-balance font-heading text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-6xl">
          {props.headlineL1}
          <br />
          {props.headlineL2}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {props.subtitle}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Button asChild variant="cta" size="xl" className="w-full sm:w-auto">
            <Link href={CATALOG_PATH} data-testid="hero-cta-catalog">
              {props.ctaCatalog}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="xl" className="w-full sm:w-auto">
            <Link href={EMPRESAS_PATH} data-testid="hero-cta-business">
              {props.ctaBusiness}
            </Link>
          </Button>
        </div>
        <div className="mt-4">
          <HeroStats stats={props.stats} />
        </div>
      </div>

      <div className="order-2 flex flex-col gap-2">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-primary/30 bg-muted shadow-sm">
          {props.imageUrl ? (
            <Image
              src={props.imageUrl}
              alt={props.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              data-testid="hero-image-fallback"
              className="flex size-full items-center justify-center"
            >
              <HugeiconsIcon
                icon={Chair01Icon}
                size={72}
                strokeWidth={1.5}
                className="text-muted-foreground/40"
              />
            </span>
          )}
          <CertTag grade={props.cert.grade} code={props.cert.code} meta={props.cert.meta} />
        </div>
        <p className="text-xs text-muted-foreground/80">{props.disclaimer}</p>
      </div>
    </div>
  );
}

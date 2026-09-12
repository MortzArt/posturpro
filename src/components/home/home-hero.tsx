import Image from "next/image";
import { Chair01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, EMPRESAS_PATH } from "@/lib/config";
import { HeroStats, type HeroStat } from "@/components/home/hero-stats";
import { CertTag } from "@/components/home/cert-tag";

/**
 * HomeHero (T20 Factorial grammar) — the homepage front door: no eyebrow, a big
 * tight 2-line headline in ink, soft-ink subcopy, two CTAs (catalog = orange
 * pill primary; business = 2px ink-outline pill secondary), a 3-figure naked
 * stat row, and a white floating media card with the cert-tag overlay.
 * Distinct from the shared `Hero` (still used by /empresas) because this
 * variant has the stats + cert-tag + dual-CTA hierarchy.
 *
 * The `eyebrow` prop is retained (so page.tsx is untouched) but intentionally
 * not rendered — Factorial is headline-first (AC-3). Headline emphasis comes
 * from weight + tightness, never orange (AC-9). Media degrades to a token-tinted
 * glyph tile when `imageUrl` is null. Motion reuses `.enter-fade` (copy);
 * reduced motion is handled by the shared classes.
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
}

export function HomeHero(props: HomeHeroProps) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="enter-fade order-1 flex max-w-xl flex-col gap-4">
        {/* Factorial has no eyebrow — the headline carries its own weight
            (AC-3). The `eyebrow` prop stays in the interface so page.tsx is
            untouched; it is intentionally not rendered. */}
        <h1 className="text-balance font-heading text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
          {props.headlineL1}
          <br />
          {props.headlineL2}
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          {props.subtitle}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Button asChild variant="cta" size="xl" className="w-full sm:w-auto">
            <Link href={CATALOG_PATH} data-testid="hero-cta-catalog">
              {props.ctaCatalog}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="xl"
            className="pill-outline w-full sm:w-auto"
          >
            <Link href={EMPRESAS_PATH} data-testid="hero-cta-business">
              {props.ctaBusiness}
            </Link>
          </Button>
        </div>
        <div className="mt-4">
          <HeroStats stats={props.stats} />
        </div>
      </div>

      <div className="order-2">
        {/* White floating media card sits directly on the hero photo — no tint
            canvas frame (owner request 2026-09-12). Keeps `aspect-[4/3]`. */}
        <div className="factorial-card relative aspect-[4/3] w-full overflow-hidden rounded-md">
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
          <CertTag
            grade={props.cert.grade}
            code={props.cert.code}
            meta={props.cert.meta}
          />
        </div>
      </div>
    </div>
  );
}

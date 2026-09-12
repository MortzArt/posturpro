/**
 * HeroStats (T19 D.1) — the 3-figure hero stat row. Three short placeholder
 * figures fit at 320px as a 3-up grid. Pre-resolved strings (repo contract).
 */

export interface HeroStat {
  figure: string;
  label: string;
}

interface HeroStatsProps {
  stats: readonly [HeroStat, HeroStat, HeroStat];
}

export function HeroStats({ stats }: HeroStatsProps) {
  return (
    <dl className="grid grid-cols-3 items-start gap-3 sm:gap-6" data-testid="hero-stats">
      {stats.map((stat, index) => (
        // Keyed on position: `stats` is a fixed 3-tuple that never reorders or
        // filters, so the index is stable — and it avoids a duplicate-key React
        // warning if two placeholder stats ever share a label (m-4).
        <div key={index} className="flex min-w-0 flex-col gap-1 text-center sm:text-left">
          <dt className="sr-only">{stat.label}</dt>
          {/* Phones: one size step down so "+3,200" never crowds its column;
              labels share one leading so a two-line label sits tidily beside
              one-liners (owner request 2026-09-13). */}
          <dd className="font-heading text-[1.75rem] leading-none font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl sm:leading-none">
            {stat.figure}
          </dd>
          <p
            aria-hidden
            className="text-xs leading-snug tracking-[-0.02em] text-pretty text-muted-foreground sm:text-sm"
          >
            {stat.label}
          </p>
        </div>
      ))}
    </dl>
  );
}

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
    <dl className="grid grid-cols-3 gap-4 sm:gap-6" data-testid="hero-stats">
      {stats.map((stat, index) => (
        // Keyed on position: `stats` is a fixed 3-tuple that never reorders or
        // filters, so the index is stable — and it avoids a duplicate-key React
        // warning if two placeholder stats ever share a label (m-4).
        <div key={index} className="flex flex-col gap-1">
          <dt className="sr-only">{stat.label}</dt>
          <dd className="font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl">
            {stat.figure}
          </dd>
          <p aria-hidden className="text-sm tracking-[-0.02em] text-muted-foreground">
            {stat.label}
          </p>
        </div>
      ))}
    </dl>
  );
}

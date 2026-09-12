/**
 * ProcessSteps (T19 D.5) — 4 numbered certification steps. `id="proceso"` with
 * scroll-mt so the header deep-link lands cleanly below the sticky chrome. The
 * big step numbers carry the sequence (a legitimate use — the reader needs the
 * order). Each step is a floating white `.factorial-card` (same card grammar as
 * the values grid). Steps enter with `.stagger`. All strings pre-resolved.
 */

export interface ProcessStep {
  number: string;
  title: string;
  body: string;
}

interface ProcessStepsProps {
  eyebrow: string;
  heading: string;
  subcopy: string;
  steps: readonly [ProcessStep, ProcessStep, ProcessStep, ProcessStep];
}

/** Stagger step; capped so the row settles ≤ ~200ms. */
const STAGGER_STEP_MS = 50;

export function ProcessSteps(props: ProcessStepsProps) {
  return (
    <div
      id="proceso"
      className="flex flex-col gap-8 scroll-mt-28"
      data-testid="process-steps"
    >
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-sm font-medium tracking-[-0.02em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
          {props.heading}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {props.subcopy}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {props.steps.map((step, index) => (
          <li
            key={step.number}
            className="stagger factorial-card flex flex-col gap-1 p-6"
            style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
          >
            <span
              aria-hidden
              className="font-heading text-5xl font-bold tabular-nums tracking-[-0.04em] text-primary/25 sm:text-6xl"
            >
              {step.number}
            </span>
            <h3 className="mt-2 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground">
              {step.title}
            </h3>
            <p className="text-base text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * ProcessSteps (T19 D.5) — 4 numbered certification steps. `id="proceso"` with
 * scroll-mt so the header deep-link lands cleanly below the sticky chrome. The
 * big step numbers carry the sequence (a legitimate use — the reader needs the
 * order). Steps enter with `.stagger`. All strings pre-resolved.
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
    <div className="flex flex-col gap-8" data-testid="process-steps">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {props.eyebrow}
        </p>
        <h2 className="font-heading text-2xl font-bold tracking-wide text-foreground sm:text-3xl">
          {props.heading}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          {props.subcopy}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {props.steps.map((step, index) => (
          <li
            key={step.number}
            className="stagger flex flex-col gap-1"
            style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
          >
            <span
              aria-hidden
              className="font-heading text-4xl font-bold tabular-nums text-primary/25"
            >
              {step.number}
            </span>
            <h3 className="mt-2 font-heading text-base font-semibold text-foreground">
              {step.title}
            </h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

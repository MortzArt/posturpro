import { HugeiconsIcon } from "@hugeicons/react";
import { Award01Icon } from "@hugeicons/core-free-icons";

/**
 * CertTag (T19 D.1) — the mockup's rotated brass cert-tag reinterpreted in our
 * design language: a small tokenized card (NOT rotated) overlaid bottom-left on
 * the hero media. It is a STATIC illustrative element (grade + cert number are a
 * proposal, tied to nothing real) — the hero disclaimer footnote makes that
 * explicit. All strings pre-resolved. Mounts with `.enter-fade` (+delay set by
 * the caller); the parent guards reduced motion via the shared class.
 */

interface CertTagProps {
  grade: string;
  code: string;
  meta: string;
}

export function CertTag({ grade, code, meta }: CertTagProps) {
  return (
    <div
      data-testid="hero-cert-tag"
      className="enter-fade absolute bottom-3 left-3 max-w-[190px] rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-factorial)] backdrop-blur-sm"
    >
      <p className="flex items-center gap-1.5 font-heading text-sm font-semibold text-primary">
        <HugeiconsIcon
          icon={Award01Icon}
          size={14}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-primary"
        />
        {grade}
      </p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{code}</p>
      <p className="mt-0.5 text-[11px] tracking-[-0.02em] text-muted-foreground">
        {meta}
      </p>
    </div>
  );
}

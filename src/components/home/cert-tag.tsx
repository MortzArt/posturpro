import { HugeiconsIcon } from "@hugeicons/react";
import { Award01Icon } from "@hugeicons/core-free-icons";

/**
 * CertTag (T19 D.1) — the mockup's rotated brass cert-tag reinterpreted in our
 * design language: a small tokenized card (NOT rotated) overlaid bottom-left on
 * the hero media. It is a STATIC illustrative element (grade + inspection meta;
 * the cert number was removed at the owner's request 2026-09-12). All strings
 * pre-resolved. Mounts with `.enter-fade` (+delay set by
 * the caller); the parent guards reduced motion via the shared class.
 */

interface CertTagProps {
  grade: string;
  meta: string;
}

export function CertTag({ grade, meta }: CertTagProps) {
  return (
    <div
      data-testid="hero-cert-tag"
      className="enter-fade absolute bottom-3 left-3 max-w-[190px] rounded-md bg-card/95 p-3 shadow-[var(--shadow-factorial)] backdrop-blur-sm"
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
      <p className="mt-1 text-[11px] tracking-[-0.02em] text-muted-foreground">
        {meta}
      </p>
    </div>
  );
}

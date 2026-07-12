"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

/**
 * Localized client error boundary (T2 AC-11, error-states table).
 *
 * Renders ONLY localized copy — never `error.message` or `error.stack` in the
 * UI, so no stack trace or PII leaks in production. The detail is logged
 * client-side for debugging; `error.digest` (an opaque hash) is shown as a
 * small support reference, which is safe. "Reintentar" calls `reset()` to
 * re-render the failed segment. Rendered inside the shell.
 */

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const t = useTranslations("error");

  useEffect(() => {
    // Log detail for debugging; never surfaced to the user (AC-11).
    console.error("[error-boundary] Unhandled route error:", error);
  }, [error]);

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="mx-auto flex min-h-[60vh] max-w-(--breakpoint-xl) flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <div className="enter-fade flex flex-col items-center gap-3">
        <HugeiconsIcon
          icon={Alert02Icon}
          size={40}
          strokeWidth={2}
          className="text-destructive"
          aria-hidden
        />
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("description")}
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-2 min-h-11 px-4"
          data-testid="error-retry"
          onClick={reset}
        >
          {t("retry")}
        </Button>
        {error.digest ? (
          <p className="text-xs text-muted-foreground" data-testid="error-digest">
            {t("reference", { digest: error.digest })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

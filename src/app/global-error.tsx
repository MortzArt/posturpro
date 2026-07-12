"use client";

import { useEffect } from "react";

/**
 * Global error boundary (T2 AC-11). Catches errors thrown in the root layout
 * itself — the one place `[locale]/error.tsx` cannot cover. It must render its
 * own `<html>`/`<body>` (it replaces the whole document) and cannot rely on the
 * next-intl provider (the failure may be in locale resolution), so it uses a
 * neutral bilingual message and NEVER leaks the error message/stack to the UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] Root layout error:", error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "4rem 1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Algo salió mal / Something went wrong
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#666", maxWidth: "28rem" }}>
          Ocurrió un error inesperado. Inténtalo de nuevo. / An unexpected error
          occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          data-testid="global-error-retry"
          style={{
            marginTop: "0.5rem",
            height: "2.25rem",
            padding: "0 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #ccc",
            background: "#111",
            color: "#fff",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Reintentar / Try again
        </button>
      </body>
    </html>
  );
}

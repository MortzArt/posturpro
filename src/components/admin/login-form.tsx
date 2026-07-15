"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { login } from "@/app/admin/actions";
import {
  initialAdminLoginState,
  type AdminLoginState,
} from "@/app/admin/admin-form-state";
import { cn } from "@/lib/utils";

/**
 * LoginForm (T10 AC-2, AC-3, edge 4) — the only client piece of the login screen.
 * `useActionState` wires the `login` server action. On success the action
 * `redirect()`s (success is never a rendered state). On failure a SINGLE generic
 * banner appears (no per-field blame, no user enumeration, AC-3): the email is
 * preserved, the password is always cleared. Pending state disables the fields +
 * button (no double-submit). Card + banner reuse `.enter-fade` (RM-safe).
 */
const fieldClasses =
  "w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60";

export function LoginForm({ storeName }: { storeName: string }) {
  const [state, formAction, pending] = useActionState<AdminLoginState, FormData>(
    login,
    initialAdminLoginState,
  );

  const emailRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const emailId = useId();
  const passwordId = useId();

  // Autofocus the email on mount (single-purpose screen).
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Announce/focus the generic error banner WITHOUT moving focus into a field —
  // preserving the "which field?" ambiguity (AC-3).
  useEffect(() => {
    if (state.status !== "idle") {
      bannerRef.current?.focus();
    }
  }, [state.status, state.submissionId]);

  const bannerMessage = resolveBannerMessage(state.status);

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4">
      <div className="enter-fade flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Acceso de administrador
          </h1>
        </div>

        {bannerMessage ? (
          <div
            ref={bannerRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            data-testid="admin-login-error"
            className="enter-fade flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none"
          >
            <HugeiconsIcon
              icon={Alert02Icon}
              size={16}
              strokeWidth={2}
              aria-hidden
              className="mt-0.5 shrink-0"
            />
            <span>{bannerMessage}</span>
          </div>
        ) : null}

        <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="admin-login-form">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailId} className="text-sm font-medium">
              Correo electrónico
            </label>
            <input
              ref={emailRef}
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              required
              disabled={pending}
              defaultValue={state.values?.email ?? ""}
              placeholder="correo@ejemplo.com"
              data-testid="admin-login-email"
              className={fieldClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium">
              Contraseña
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
              data-testid="admin-login-password"
              className={fieldClasses}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={pending}
            data-testid="admin-login-submit"
            className={cn("min-h-11 w-full px-4")}
          >
            {pending ? "Iniciando sesión…" : "Iniciar sesión"}
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Map a login status to its localized banner message (or null when idle). */
function resolveBannerMessage(status: AdminLoginState["status"]): string | null {
  switch (status) {
    case "error":
      return "Correo o contraseña incorrectos.";
    case "rate-limited":
      return "Demasiados intentos. Intenta de nuevo en unos minutos.";
    case "unavailable":
      return "El acceso de administrador no está disponible.";
    default:
      return null;
  }
}

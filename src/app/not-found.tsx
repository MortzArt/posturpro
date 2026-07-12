import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/i18n/routing";
import { sans } from "@/app/fonts";
import { cn } from "@/lib/utils";

/**
 * Root not-found (T2 AC-10). Reached only for paths that never enter the
 * `[locale]` segment (e.g. a bare unmatched top-level path the middleware
 * couldn't rewrite). No locale is resolvable here, so it renders the DEFAULT
 * locale's copy inside a minimal `<html>` shell — the localized-inside-full-
 * shell 404 lives at `[locale]/not-found.tsx` and covers the normal case
 * (dead nav link / invalid locale). Kept intentionally minimal to avoid a
 * second shell implementation.
 */
export default async function RootNotFound() {
  const locale = routing.defaultLocale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    <html lang={locale} className={cn("h-full", sans.variable)}>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider locale={locale}>
          <main className="mx-auto flex min-h-dvh max-w-(--breakpoint-xl) flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <p
              aria-hidden
              className="text-5xl font-semibold tracking-tight text-muted-foreground"
            >
              {t("code")}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("description")}
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("backHome")}
            </Link>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

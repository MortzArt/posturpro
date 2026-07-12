import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Localized 404 page (T2 AC-10, edge case 1). Rendered inside the shell
 * (header + footer come from `[locale]/layout.tsx`). Shows a friendly localized
 * message and a "back to home" action. A real `<h1>` for screen readers.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-(--breakpoint-xl) flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="enter-fade flex flex-col items-center gap-3">
        <p
          aria-hidden
          className="text-5xl font-semibold tracking-tight text-muted-foreground"
        >
          {t("code")}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("description")}
        </p>
        <Button asChild size="lg" className="mt-2 min-h-11 px-4">
          <Link href="/" data-testid="not-found-home">
            {t("backHome")}
          </Link>
        </Button>
      </div>
    </section>
  );
}

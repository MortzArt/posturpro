import { getTranslations } from "next-intl/server";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import {
  QUOTE_COMPANY_MAX,
  QUOTE_NAME_MAX,
  QUOTE_EMAIL_MAX,
  QUOTE_PHONE_MAX,
  QUOTE_MESSAGE_MAX,
} from "@/lib/config";
import {
  QuoteForm,
  type QuoteFormLabels,
} from "@/app/[locale]/empresas/quote-form";

/**
 * B2BSection (T19 D.6) — the homepage business block: a pitch column (heading,
 * value list, segments, stats) beside the REUSED T16
 * `QuoteForm` (edge 10/11 inherited — no parallel pipeline). The form's labels
 * come from the existing `empresas.*` namespace (NOT duplicated); this section's
 * chrome comes from `home.b2b.*`.
 *
 * `id="empresas"` on the section; `id="cotizacion"` on the form panel so the CTA
 * banner / footer anchors land on the form. Single-column until `lg` (UX req).
 */
export async function B2BSection() {
  const t = await getTranslations("home.b2b");
  const tForm = await getTranslations("empresas");

  const values = [
    t("value1"),
    t("value2"),
    t("value3"),
    t("value4"),
    t("value5"),
  ];

  return (
    <div
      id="empresas"
      className="grid scroll-mt-28 grid-cols-1 gap-10 lg:grid-cols-2"
      data-testid="b2b-section"
    >
      <div className="enter-fade flex flex-col gap-4">
        <p className="text-sm font-medium tracking-[-0.02em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
          {t("heading")}
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          {t("subcopy")}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="flex items-start gap-2 text-base text-foreground"
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={18}
                strokeWidth={2}
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--ring)]"
              />
              {value}
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <p className="text-base font-medium text-foreground">
            {t("segmentsHeading")}
          </p>
          <p className="mt-1 text-base text-muted-foreground">
            {t("segments")}
          </p>
        </div>
        <dl className="mt-2 flex gap-8">
          <div className="flex flex-col gap-1">
            <dt className="font-heading text-3xl font-bold tabular-nums tracking-[-0.04em] text-foreground">
              {t("stat1Figure")}
            </dt>
            <dd className="text-sm text-muted-foreground">{t("stat1Label")}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-heading text-3xl font-bold tabular-nums tracking-[-0.04em] text-foreground">
              {t("stat2Figure")}
            </dt>
            <dd className="text-sm text-muted-foreground">{t("stat2Label")}</dd>
          </div>
        </dl>
      </div>

      <div id="cotizacion" className="factorial-card scroll-mt-28 p-6 sm:p-8">
        <QuoteForm
          labels={buildFormLabels(tForm)}
          maxLengths={{
            company: QUOTE_COMPANY_MAX,
            name: QUOTE_NAME_MAX,
            email: QUOTE_EMAIL_MAX,
            phone: QUOTE_PHONE_MAX,
            needs: QUOTE_MESSAGE_MAX,
          }}
        />
      </div>
    </div>
  );
}

type EmpresasTranslator = Awaited<
  ReturnType<typeof getTranslations<"empresas">>
>;

/**
 * Assemble the flat, serializable label bag the client `QuoteForm` consumes,
 * from the existing `empresas.*` namespace (mirrors the /empresas page builder —
 * quote copy is reused, never duplicated).
 */
function buildFormLabels(t: EmpresasTranslator): QuoteFormLabels {
  return {
    company: t("form.company.label"),
    companyPlaceholder: t("form.company.placeholder"),
    name: t("form.name.label"),
    namePlaceholder: t("form.name.placeholder"),
    email: t("form.email.label"),
    emailPlaceholder: t("form.email.placeholder"),
    phone: t("form.phone.label"),
    phoneOptional: t("form.phone.optional"),
    phonePlaceholder: t("form.phone.placeholder"),
    teamSize: t("form.teamSize.label"),
    teamSizePlaceholder: t("form.teamSize.placeholder"),
    teamSizeOptions: {
      "1-10": t("form.teamSize.options.1-10"),
      "11-50": t("form.teamSize.options.11-50"),
      "51-200": t("form.teamSize.options.51-200"),
      "200+": t("form.teamSize.options.200+"),
    },
    needs: t("form.needs.label"),
    needsPlaceholder: t("form.needs.placeholder"),
    charCount: t.raw("form.charCount"),
    submit: t("form.submit"),
    submitting: t("form.submitting"),
    honeypot: t("form.honeypot"),
    success: t("form.success"),
    errorGeneric: t("form.errorGeneric"),
    rateLimited: t("form.rateLimited"),
    retry: t("form.retry"),
    errors: {
      companyRequired: t("form.errors.companyRequired"),
      companyTooLong: t("form.errors.companyTooLong"),
      nameRequired: t("form.errors.nameRequired"),
      nameTooLong: t("form.errors.nameTooLong"),
      emailRequired: t("form.errors.emailRequired"),
      emailInvalid: t("form.errors.emailInvalid"),
      emailTooLong: t("form.errors.emailTooLong"),
      phoneTooLong: t("form.errors.phoneTooLong"),
      teamSizeRequired: t("form.errors.teamSizeRequired"),
      teamSizeInvalid: t("form.errors.teamSizeInvalid"),
      needsRequired: t("form.errors.needsRequired"),
      needsTooLong: t("form.errors.needsTooLong"),
    },
  };
}

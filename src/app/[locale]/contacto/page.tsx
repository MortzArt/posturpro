import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import {
  CONTACT_SLUG,
  CONTACT_NAME_MAX,
  CONTACT_EMAIL_MAX,
  CONTACT_SUBJECT_MAX,
  CONTACT_MESSAGE_MAX,
} from "@/lib/config";
import { getStaticPageBySlug } from "@/lib/content/static-pages";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { StaticPageBody } from "@/components/content/static-page-body";
import { ContactForm, type ContactFormLabels } from "./contact-form";

/**
 * Contact page (T13 AC-11..AC-16). Bespoke route (own folder) — App Router
 * resolves this static segment before the generic `[pageSlug]`. The server
 * component renders the shell (breadcrumb + h1 + prose intro/hours from the
 * `contacto` static_pages body) and the sole client island, `<ContactForm/>`.
 * A missing/unpublished `contacto` row still degrades to the in-shell 404.
 */

interface ContactPageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(locale: string): string {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "contact",
  });
  return { title: t("metadata.title") };
}

/** Assemble the flat, serializable label bag the client form consumes. */
function buildLabels(
  t: Awaited<ReturnType<typeof getTranslations<"contact">>>,
): ContactFormLabels {
  return {
    name: t("name.label"),
    namePlaceholder: t("name.placeholder"),
    email: t("email.label"),
    emailPlaceholder: t("email.placeholder"),
    subject: t("subject.label"),
    subjectOptional: t("subject.optional"),
    subjectPlaceholder: t("subject.placeholder"),
    message: t("message.label"),
    messagePlaceholder: t("message.placeholder"),
    charCount: t("charCount"),
    submit: t("submit"),
    submitting: t("submitting"),
    honeypot: t("honeypot"),
    success: t("success"),
    errorGeneric: t("errorGeneric"),
    rateLimited: t("rateLimited"),
    retry: t("retry"),
    errors: {
      nameRequired: t("errors.nameRequired"),
      nameTooLong: t("errors.nameTooLong"),
      emailRequired: t("errors.emailRequired"),
      emailInvalid: t("errors.emailInvalid"),
      emailTooLong: t("errors.emailTooLong"),
      subjectTooLong: t("errors.subjectTooLong"),
      messageRequired: t("errors.messageRequired"),
      messageTooLong: t("errors.messageTooLong"),
    },
  };
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const activeLocale = resolveLocale(locale);
  const page = await getStaticPageBySlug(CONTACT_SLUG, activeLocale);
  if (!page) {
    notFound();
  }

  const [tCatalog, tContact] = await Promise.all([
    getTranslations("catalog"),
    getTranslations("contact"),
  ]);

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={tCatalog("breadcrumb.ariaLabel")}
        moreLabel={tCatalog("pagination.morePages")}
        items={[
          { label: tCatalog("breadcrumb.home"), href: "/" },
          { label: page.title },
        ]}
      />
      <header className="mb-6 mt-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {page.title}
        </h1>
      </header>

      <StaticPageBody body={page.body} />

      <ContactForm
        labels={buildLabels(tContact)}
        maxLengths={{
          name: CONTACT_NAME_MAX,
          email: CONTACT_EMAIL_MAX,
          subject: CONTACT_SUBJECT_MAX,
          message: CONTACT_MESSAGE_MAX,
        }}
      />
    </section>
  );
}

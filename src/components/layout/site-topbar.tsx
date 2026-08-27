import { getTranslations } from "next-intl/server";
import {
  WHATSAPP_DISPLAY,
  WHATSAPP_PHONE_E164,
  WHATSAPP_PREFILL_MESSAGE_ES,
} from "@/lib/config";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

/**
 * SiteTopbar (T19 AC-15) — a thin deep-green promo bar above the header carrying
 * three static messages (nationwide shipping / interest-free installments / tax
 * invoicing) and a WhatsApp contact link.
 *
 * Messages are STATIC (not a rotating carousel): a carousel is motion without
 * purpose (Emil) + JS/CSP cost; all three fit desktop and scroll horizontally on
 * mobile. At 320px the message row scrolls-x (scrollbar hidden) so nothing breaks,
 * and the WhatsApp link is hidden below `sm` (still reachable via header/footer/FAB).
 *
 * WA-GUARDED (edge 5): `buildWhatsAppUrl` returns null when the phone is
 * unconfigured → the link is omitted (never a broken `wa.me//`); the messages
 * still render. The focus ring is white-ish so it is visible on the green bar.
 */
export async function SiteTopbar() {
  const t = await getTranslations("topbar");
  const waUrl = buildWhatsAppUrl(WHATSAPP_PHONE_E164, WHATSAPP_PREFILL_MESSAGE_ES);

  return (
    <div className="bg-primary text-primary-foreground" data-testid="site-topbar">
      <div className="mx-auto flex h-9 max-w-(--breakpoint-xl) items-center gap-4 px-4 md:px-6 lg:px-8">
        <ul className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap text-xs tracking-[-0.02em] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li>{t("msg1")}</li>
          <li aria-hidden>·</li>
          <li>{t("msg2")}</li>
          <li aria-hidden>·</li>
          <li>{t("msg3")}</li>
        </ul>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("contactAria")}
            data-testid="topbar-whatsapp"
            className="hidden shrink-0 items-center gap-1 rounded-sm text-xs font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-foreground/60 sm:inline-flex"
          >
            {t("contactPrefix")} {WHATSAPP_DISPLAY}
          </a>
        ) : null}
      </div>
    </div>
  );
}

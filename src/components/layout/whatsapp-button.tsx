import { getTranslations } from "next-intl/server";
import { HugeiconsIcon } from "@hugeicons/react";
import { WhatsappIcon } from "@hugeicons/core-free-icons";
import {
  WHATSAPP_PHONE_E164,
  WHATSAPP_PREFILL_MESSAGE_ES,
} from "@/lib/config";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * WhatsAppButton (T2 AC-8, AC-13, AC-14, edge case 7).
 *
 * Fixed floating action button, bottom-right on every page. Links to
 * `https://wa.me/<number>?text=<url-encoded es prefill>`, opens in a new tab
 * with `rel="noopener noreferrer"`, and has an accessible label from the
 * `whatsapp` dictionary (the icon is decorative → `aria-hidden`).
 *
 * CONFIG-GUARDED: the phone + message come from `src/lib/config.ts`. When the
 * number is unconfigured (empty), `buildWhatsAppUrl` returns `null` and the
 * button is NOT rendered — never a broken numberless `wa.me/` link. The absence
 * is logged in development only (edge case 7).
 *
 * Motion (`.fab-pop` in globals.css): pop-in entrance, press feedback, and a
 * hover lift gated behind hover-capable pointers — transform/opacity only, with
 * a reduced-motion fallback. Sits at `z-50`, below the drawer scrim (`z-[60]`),
 * with a safe-area inset so it never overlaps footer content (AC-14).
 */
export async function WhatsAppButton() {
  const href = buildWhatsAppUrl(WHATSAPP_PHONE_E164, WHATSAPP_PREFILL_MESSAGE_ES);

  if (href === null) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[whatsapp] WHATSAPP_PHONE_E164 is not configured in src/lib/config.ts; " +
          "the floating WhatsApp button is hidden (T2 edge case 7).",
      );
    }
    return null;
  }

  const t = await getTranslations("whatsapp");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-button"
      aria-label={t("label")}
      className={cn(
        "fab-pop fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50",
        "inline-flex size-14 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg outline-none",
        "hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "md:right-6 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      <HugeiconsIcon icon={WhatsappIcon} size={28} strokeWidth={2} aria-hidden />
    </a>
  );
}

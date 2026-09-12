# PosturPro — Website Content Questionnaire (for client)

We've built the homepage and all static pages with working draft content. Some of it is real and just needs your confirmation; some of it is placeholder text that only you can provide. Below is everything we need, organized by page. Where we already wrote a draft, we show it — you can approve it as-is or send changes.

For reference, here's a competitor doing this well: https://crandalloffice.com — worth a 5-minute look to see how they use their story, warranty, and reviews to build trust.

---

## 🔴 Priority 1 — Blockers (site can't go live properly without these)

### Legal — Aviso de Privacidad & Términos y Condiciones
Current text is a generic template flagged as placeholder.
1. Do you have a lawyer/accountant who will provide the official Aviso de Privacidad (required under Mexican LFPDPPP) and Términos y Condiciones? If yes, when can we expect the text?
2. If not, do you want us to prepare a solid draft for your lawyer to review?
3. What is the exact legal name of the business (razón social) and RFC to appear in legal pages?
4. Official business address for legal notices?

### Showroom page
Current address is fake ("Av. Ejemplo 123" — marked as reference).
5. What is the real showroom address?
6. Real opening hours? (Current draft: Mon–Fri 9:00–18:00, Sat 10:00–14:00, Sun closed)
7. Should we link to your Google Maps listing? Please send the link (or confirm you have a Google Business Profile — if not, we strongly recommend creating one).
8. Do you have photos of the showroom (interior/exterior) we can use?
9. Do customers need an appointment to visit, or walk-ins welcome?

### Contact page
10. What email address should receive contact-form messages and be shown publicly?
11. Public phone number? WhatsApp? (In Mexico, a WhatsApp button is often the #1 contact channel — do you want one site-wide?)
12. Support hours — confirm: Mon–Fri 9:00–18:00 (Mexico City time)?

---

## 🟠 Priority 2 — Pages with template copy that needs your real story

### About page (Sobre nosotros)
Currently generic ("your specialized ergonomic chair store in Mexico"). The competitor's About page is their strongest trust asset: founding year, family story, team names/photos, mission, values.
13. When was the business founded, and how did it start? (2–3 sentences of the real story — even a short one beats a generic pitch)
14. Who is behind the business? Names/roles you're comfortable publishing? Team or founder photos?
15. What is your mission in your own words? What do you want customers to feel about PosturPro?
16. What makes you different from other chair sellers in Mexico? (e.g., you test/curate every model, multi-brand selection, expert advice, price, service)
17. Any numbers we can use as trust signals: years in business, chairs sold, companies served, brands carried?

### Warranty page (Garantía)
Current text is a generic template ("manufacturer's warranty covers defects…").
18. What warranty do you actually offer, per brand or per product line? (duration, what's covered/excluded)
19. Is it the manufacturer's warranty passed through, or do you add your own coverage?
20. How does a customer make a warranty claim, step by step? Who pays shipping on warranty repairs?

---

## 🟡 Priority 3 — Drafted content: confirm or correct

### Shipping page (Envíos) — currently drafted as:
- Flat rate MX$500; free shipping over MX$10,000
- Processing 1–2 business days, delivery 3–7 business days
- Tracking sent by email
21. Are these rates and times correct? Which carrier(s) do you use?
22. Do you ship everywhere in Mexico, or are there excluded zones? Ship internationally?
23. Do you offer white-glove delivery/assembly for offices?

### Returns page (Devoluciones) — currently drafted as:
- 30-day return window
- Refunds in 5–10 business days
24. Confirm the 30-day window? Who pays return shipping?
25. Conditions: original packaging required? Restocking fee? Any final-sale items (e.g., clearance, custom orders)?

### FAQ — currently 5 questions (shipping time, returns, assembly, payment methods, physical store)
26. What are the top questions customers actually ask you? Send us your top 10–15 (raw, informal is fine — we'll write them up). The competitor has ~25 FAQs organized by category; more real FAQs = fewer support messages and better Google ranking.
27. Do chairs arrive assembled or does the customer assemble? Do you offer assembly service?

### Homepage — current copy is solid ("Sillas ergonómicas para cuidar tu espalda"), but confirm:
28. Are you happy with the main headline and the positioning "chairs chosen for how they care for your body, not the label"?
29. Which products/brands should be featured first on the homepage?
30. Do you have any customer reviews or testimonials we can display? Google reviews, WhatsApp messages from happy clients, corporate clients we can name? (The competitor leads with "4.9★ — 2,500+ reviews" — social proof is their #1 conversion tool.)
31. Do you have real photos of your chairs/showroom/deliveries? We're currently using licensed stock photos — real photos convert better.

### B2B page (Empresas) — currently drafted with 3 pillars (ergonomic expertise, brand selection, volume pricing) and a quote form
32. Confirm the pitch? What team size qualifies for volume pricing?
33. Any corporate clients we can mention or logos we can show?
34. Who receives quote requests, and what's your realistic response time promise? (Current draft implies a fast reply.)

---

## 🟢 Priority 4 — Optional features seen on the competitor (yes/no decisions)

35. **Financing / installments** — do you offer meses sin intereses via Mercado Pago? If yes, we should advertise it prominently (competitor promotes Affirm/PayPal financing to sell $300–$1,200 chairs).
36. **Newsletter** — want an email signup with an incentive (e.g., discount, new-arrival alerts)?
37. **Live chat / WhatsApp widget** — want one on every page?
38. **Video** — any video of the showroom or chair demos? Competitor uses a homepage video.
39. **Social media** — which profiles should the footer link to (Facebook, Instagram, TikTok, LinkedIn, YouTube)?
40. **Blog/guides** — interest in content like "how to choose an ergonomic chair"? (Good for SEO, can come later.)

---

*Prepared 2026-08-21. Pages audited: Home, Empresas, Contacto, Showroom, Sobre nosotros, Envíos, Devoluciones, Garantía, FAQ, Aviso de Privacidad, Términos.*

---

## T19 — Homepage rebuild placeholder figures (added 2026-08-27)

Every illustrative/example value shipped in the new homepage + shell that needs
owner → client confirmation before launch. All live in the translation files
(`src/messages/es-MX.json` + `en.json`) or config so they are trivial to swap.

- **Hero stats:** +3,200 chairs delivered · 100% function verified · 60% average savings. (`home.hero.stats.*`)
- **Cert-tag (illustrative element):** grade A+, cert no. PP-04821. (`home.hero.cert.*`)
- **Impact strip:** +3,200 second-life chairs · 9,400 kg rescued · 60% less footprint. (`home.impact.*`)
- **B2B panel stats:** +150 offices furnished · 24h quote response. (`home.b2b.stat*`)
- **Testimonials (illustrative, placeholder names):** Regina P. (individual, CDMX); Administration Manager (manufacturing). (`home.social.*`)
- **Calculator reference prices** (`src/lib/config/calculator.ts`, MXN new → PosturPro):
  Aeron 38,500 → 21,900 · Leap V2 32,000 → 15,900 · Zody 24,000 → 11,500 ·
  Embody 42,500 → 26,500 · Gesture 29,500 → 14,900 · Sayl 19,500 → 9,800.
- **Contact:** WhatsApp/phone +52 55 1234 5678 (`WHATSAPP_DISPLAY` / `WHATSAPP_PHONE_E164`) ·
  email hola@posturpro.mx (`home.footer.contactEmail`) · showroom cities CDMX/Guadalajara/Monterrey ·
  hours Mon–Fri 9:00–18:00.
- **Social links:** Instagram ✅ https://www.instagram.com/posturpro (footer + Organization `sameAs`, 2026-09-12) · LinkedIn / Facebook hrefs — still `#` (footer).
- **Legal links:** Aviso de privacidad / Términos hrefs — currently `#` (footer bottom bar).
- **Copyright year:** 2026 (`home.footer.copyright`).
- **Brand palette source:** logo greens confirmed from `public/brand/logo.svg`
  (#094220 deep / #0f7f3c brand / #e7f7ed mint); CTA orange #f95326.
- **Condition grades (A+/A/B):** proposal adopted; assign per product in Admin →
  Productos → Condición. Products with no grade show no badge.

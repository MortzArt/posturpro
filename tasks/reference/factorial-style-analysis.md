# Factorial IT — Visual Design Language Analysis

Source: https://factorialhr.com/factorial-it (verified live 2026-08-27 via Playwright, Chromium 1440/768/375).
Cross-checked against https://factorialhr.com/ home for shared patterns.

Evidence (screenshots + raw computed-style dumps) in scratchpad:
`/private/tmp/claude-502/-Users-MortzArt-Documents-projects-posturpro/bd79ac3d-9984-464f-bdd6-980bc8088f1a/scratchpad/factorial/`

- `s-1440-00.png … s-1440-11.png` — full page at 1440, viewport slices top→footer
- `home-1440-hero.png`, `home-1440-2.png` — factorialhr.com home (warm gradient hero)
- `nav-dropdown.png` — mega-menu open; `nav-scrolled-1440.png` — sticky nav after scroll
- `faq-open.png` — accordion expanded; `m-375-hero.png`, `m-375-b.png` — mobile hero + mobile menu
- `styles-1440.json`, `styles2-1440.json` — extracted computed styles (all numbers below come from these)

All values are computed styles from the live DOM, not eyeballed.

---

## 1. Typography

**Family: DM Sans — everything.** One family for display, body, UI, numbers. Fallback stack: `"DM Sans", Helvetica, Arial, sans-serif`. DM Sans **is a Google Font** (load weights 400, 500, 600, 700; it's a variable font 100–1000 on the site). No serif, no mono, no second family anywhere.

Measured scale (desktop 1440):

| Role | Size / Line-height | Weight | Letter-spacing | Notes |
|---|---|---|---|---|
| Stat numbers ("90%") | 56 / 64 | 700 | −2.24px (−0.04em) | biggest text on page |
| Hero h1 | 44 / 48 (lh 1.09) | 700 | −1.76px (−0.04em) | mobile: 36 / 40 |
| Section h2 | 32 / 40 | 700 | −1.28px (−0.04em) | |
| Sub-heading / h2-minor | 24 / 32 | 700 | −0.96px (−0.04em) | also logo-bar claim line |
| Testimonial quote | 24 / 32 | **400** | −0.96px | big but light — reads as "voice" |
| h3 / FAQ question | 18 / 28 | 600 | −0.36px (−0.02em) | |
| Body | 16 / 24 (1.5) | 400 | 0 | color = secondary ink, not full ink |
| Nav links / footer links | 16 / 24 | 500 | 0 | |
| Buttons | 16 / 24 | 600 | 0 | |
| Small / utility links | 14 / 18 | 400–600 | −0.28px (−0.02em) | top utility bar, card captions |

**The rules that make it look like Factorial:**
- Headings are exactly **−0.04em tracking, weight 700**; small text −0.02em; body 0. Apply mechanically.
- Tight heading leading (~1.1–1.25) against roomy 1.5 body.
- Contrast comes from **weight + tightness only** — same family, same color family, no italics, no uppercase eyebrows (they don't use eyebrow labels at all — headline goes first).
- Headings are darkest ink; body drops to a softer gray-ink. Two-step ink hierarchy, never pure black.
- Sentence case everywhere, including buttons and nav. Zero uppercase.

## 2. Layout grammar

- **Container: 1184px max-width with 32px side padding** (≈1120px content). Nav uses a wider 1920px wrapper, also px-32. 12-col grid; feature rows use asymmetric spans (e.g. content col-span-5 starting col 8).
- **Section rhythm: 112px vertical padding** (`py-4xl`) on desktop, 40px on mobile. Hero is 80px top / 40px bottom. Their spacing tokens (worth cloning): 4 / 8 / 16 / 24 / 32 / 40 / 64 / 80 / 112.
- **Background strategy: the page is white. Sections do NOT alternate backgrounds.** Separation is done by rhythm and by *tinted objects on white* — pastel card canvases, gray stat cards, one full-bleed pastel-gradient band (the lead-gen form section: `linear-gradient(to right, rgba(249,214,155,.5), rgba(156,218,222,.5))` — peach→aqua at 50% opacity) and a matching gradient CTA banner card (border-radius 32px, inset from edges by 32px margin). The brand home page adds a warm cream→coral gradient hero, but interior pages stay white.
- **Grid patterns:**
  - 3-col card grids (feature benefits): white cards, screenshot area on top (pastel-tinted illustration), title 18/600 + body 16/400 below.
  - Tabbed feature showcase: pill tab bar → giant gray canvas (`#F4F4F5`, radius 16) with a floating white product-UI card centered inside it; heading (left) + one-line body (right) in a 2-col split above the canvas.
  - Stats row: 3 equal gray cards (`#F4F4F5`, radius 16, padding 32) with 56px number, 16/600 label, 13–14px caption.
- **Image treatment: no photos, no browser-chrome frames.** Product UI is rendered as clean white mock-up cards (radius 12–16, layered soft shadow) floating on pastel or gray rounded canvases (radius 16). Hero shows three such pastel cards side-by-side in an auto-playing carousel, each with a white label pill at top ("Device Management") and small circular play/pause + arrow controls (36px, white bg, 2px `#E5E7EB` border, fully round) at bottom-right.
- **Hero composition (this page):** centered, no eyebrow. h1 (max ~750px) → 2-line subtext (with a tiny inline gradient-bordered "AI" chip) → a single **capsule form**: white fully-rounded bar (shadow, ~64px tall) containing a mail icon + placeholder text + a solid primary pill button docked inside the right edge. Below, the 3-card pastel product carousel bleeds slightly wider than the text column. Mobile: everything left-aligned, input and button become stacked full-width pills.

## 3. Components

**Nav bar** — Two stacked rows, total 102px: a 32px utility row (right-aligned "Help Center · Log in", 14px/400 gray) + a 68px main row. Sticky with a negative-top trick: on scroll the utility row slides out and the 68px main row stays pinned (`--top-main-menu-height: 68px`). White background, no drop shadow — just a 1px inset hairline bottom (`inset 0 -1px 0 rgba(28,36,43,.16)`). Left: logo. Center-left: 16px/500 links with small chevrons (Product, Solutions, Resources, About us, Partners, Pricing). Right: solid primary pill CTA ("Get a demo"). Dropdowns are full-width **mega-menus**: white sheet, 3 columns (category list with chevrons → link list with 13px descriptions → promo panel with gradient bg, product screenshot and "Start product tour" link). Mobile: hamburger left, logo center, pill CTA right; menu is a full-screen white sheet with 18px rows + chevrons and drill-down subpages ("‹ Main menu" back link).

**Buttons** — all pills, `border-radius: 9999px`:
- *Primary:* solid primary color bg + **2px border in the same color**, white text 16/600, padding 4px 24px (compact, 36–40px tall in nav) or 16px 32px (large, ~56–60px tall in sections). Hover: whole button shifts to a **lighter/brighter tint of the primary** (their `#E51943` → `#FF355E`), transition `all .1s ease`. No transform, no shadow on hover.
- *Secondary:* transparent bg, 2px solid ink border, ink text 16/600, padding 12px 20px. Hover: text/border stay, subtle bg tint.
- *Tertiary/link:* 16/500 colored text link (their teal), sometimes with a "→" that nudges right on hover; plain links hover to underline.

**Pill tab bar** (signature) — light gray track (`#E8E8ED` at ~70%) fully rounded, 56px tall; inactive tabs plain 16px/400 text with hairline separators; active tab is a **white pill with soft shadow** and 600 weight, sliding 300ms `cubic-bezier(0.4,0,0.2,1)`.

**Cards** — radius **16px** (12px for small info cards). Two finishes: (a) flat gray `#F4F4F5`, no border, no shadow — for stats and canvases; (b) white with the **layered Factorial shadow**: `0 -8px 16px rgba(40,40,61,.05), 0 16px 24px rgba(40,40,61,.05), 0 4px 8px rgba(40,40,61,.05)` (variant: `0 8px 32px rgba(40,40,61,.06)`), no border — for floating product-UI cards and testimonials. Content padding 24–32px.

**Badges/labels** — white label pill on carousel cards (16px/500 ink text, padding ~12px 24px, radius full, faint shadow); tiny "AI" chip: white bg, radius 16, wrapped in a 1px warm-gradient border (peach→red→purple at 70%).

**Logo bar** — one 24px/700 claim line ("Trusted by hundreds of …") above an auto-scrolling **marquee** of grayscale/near-black logos (~40px tall), edge-faded with white gradients, with a small circular pause button. Section is only ~228px tall (40px py).

**Testimonials** — horizontal carousel of white radius-16 shadow cards, two visible; quote 24px/400 tight-tracked ink, small 14px name/role in gray, some cards carry a video thumbnail with centered circular play button + brand logo. Inactive card sits at 50% opacity. Circular outline arrow buttons below (36px, 2px border).

**FAQ / accordion** — bare rows, no cards: full-width, 1px bottom hairline `#E5E7EB`/`#D3D3D8`, question 18/600 ink, right chevron rotating on open, answer plain 16/400 gray body, ~16px row padding. Centered 32/700 section title with 16px gray subtitle above.

**Forms** — inputs are white, fully-rounded (capsule) or radius ~12 in the lead-gen block, 1px light border, generous 16px padding, placeholder in mid-gray; labels smallcase. The lead-gen section pairs a 2-col checklist (small teal check icons + 16px text) with a white radius-16 form card containing 2-col name fields, phone with country flag select, consent checkbox in 12px, and a full-width primary pill submit.

**Footer** — white, hairline-separated from content. Breadcrumb row on top (home icon › page). 4 columns of links: 16px/600 column titles (Product, Company, Support, Resources), 16px/500 ink links with 8px vertical padding, hover underline. Bottom strip: black App Store / Google Play badges left, monochrome social icons right; then hairline; then cert badges (SOC/ISO roundels) and a "Global" locale dropdown. No dark footer — it stays white.

## 4. Color roles → mapped to our palette

Factorial's system, by role, with the client-palette slot for the rebuild
(client keeps: deep green `#094220`, green `#0f7f3c`, orange `#f95326`, pure white backgrounds):

| Role | Factorial value | → Ours |
|---|---|---|
| Page background | `#FFFFFF` (interior pages; home hero uses warm cream→coral gradient) | pure white ✔ (matches client mandate) |
| Ink / headings | `#25253D` (37,37,61 — blue-violet near-black, never #000) | deep green `#094220` |
| Body / secondary text | `#515164` | desaturated dark green-gray (e.g. mix of `#094220` toward gray, ~`#3d5247`) |
| Muted text / disabled | `#A8A8B1` | neutral gray, keep |
| Hairlines / borders | `#D3D3D8`, `#E5E7EB`, nav inset `rgba(28,36,43,.16)` | same neutrals, keep |
| Surface gray (stat cards, canvases) | `#F4F4F5` | keep as-is, or whisper-green `#F2F7F4` |
| **Primary action (CTA pills, submit, nav CTA)** | red `#E51943`, hover `#FF355E` | **orange `#f95326`**, hover = lightened orange (~`#ff6b42`) |
| Brand/logo accent | same red | orange or deep green per client brand |
| Text links / tertiary actions | teal "viridian" `#007C85` (accents `#07A2AD`) | green `#0f7f3c` |
| Success/check icons | teal | green `#0f7f3c` |
| Pastel tints (card canvases) | mint `~#DFF0E8`, blush `#FAF2F4`, pale aqua | tints OF OUR greens/orange at 8–12% (e.g. `#0f7f3c` @ 8% on white) |
| Feature-band / CTA-banner gradient | `rgba(249,214,155,.5) → rgba(156,218,222,.5)` (peach→aqua, l-to-r) | soft green→warm tint, same 50%-opacity pastel energy (e.g. `#f9d69b80 → #b7e3c780`) |
| Error/destructive | red doubles up | keep a distinct red (don't reuse orange) |

Key principle to preserve: **one loud saturated color used ONLY on primary CTAs and the logo; one calm secondary color for links/checks; everything else is ink + white + whisper-tints.** The red appears maybe 5 times per screen, which is why it pops.

## 5. Motion

Restrained; no scroll-triggered reveal animations anywhere (content is static on scroll — do not add fade-ins).

- Buttons/links: `all .1s ease` color swap on hover (bg lightens). No scale, no lift.
- Tabs / interactive slides: `.3s cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind's default "standard" curve) — active pill slides, panels swap.
- Carousels: crossfade `opacity .5s cubic-bezier(0.4,0,0.2,1)`; hero product carousel and logo marquee auto-play **with visible pause buttons** (accessibility pattern worth copying).
- Accordion: chevron rotate + height expand ~300ms.
- Sticky header: utility row scrolls away, main row pins (CSS variable-driven offset), hairline stays.

## 6. Overall feel + signature moves

**Feel:** Friendly-professional SaaS with a toy-like softness: one geometric sans (DM Sans) at heavy weight and tight tracking does all the talking on a pure-white page; product UI is presented as pristine white mock-up cards floating on pastel rounded canvases; every interactive element is a pill; color discipline is extreme — near-black violet ink, one saturated CTA color, one calm link color, and 50%-opacity pastel washes. It reads simple, warm, and confident rather than techy — closer to a consumer brand than an enterprise IT vendor.

**The 5 signature moves:**
1. **One-font, tight-and-heavy headline system** — DM Sans 700 at −0.04em everywhere, ~1.1 leading, sentence case, centered; body drops to soft gray-ink at 1.5. No eyebrows, no uppercase.
2. **Everything is a pill** — CTAs (solid, 2px self-colored border), secondary buttons (2px ink outline), tab bars (white active pill sliding in a gray rounded track), the hero email-capture capsule (input + button fused in one rounded bar), carousel controls, badges.
3. **Floating product-UI cards on pastel canvases** — no photos, no browser chrome: white radius-12/16 mock-ups with the layered `rgba(40,40,61,.05)` triple shadow, sitting on mint/blush/gray radius-16 slabs; hero = a 3-card pastel carousel with label pills.
4. **White page, tinted objects** — sections never alternate background; rhythm comes from 112px padding and gray/pastel cards, punctuated exactly twice by a 50%-opacity peach→aqua gradient (full-bleed form band + radius-32 CTA banner).
5. **Oversized naked numbers & quiet chrome** — 56px stat numerals in flat gray cards, 24px light-weight testimonial quotes, hairline-only FAQ rows and nav border; loud color reserved for ~5 CTA pills per page.

## Investigation limitations

- Site did not block automation; all captures are from the live page. A cookie-consent modal (custom `.fac-cookiebot`, loads late) blocked pointer events in early runs — solved by auto-clicking "Allow all" via injected script; final screenshots are clean.
- Letter-spacings/sizes are computed at 1440px; the site uses Tailwind breakpoints, so md sizes differ (documented where captured: h1 36px on mobile).
- Hover states verified only for the primary CTA and links; secondary-button hover tint inferred from class names.
- The exact pastel tints on hero carousel cards are from images/inline styles, sampled visually (mint/blush/aqua family), not extracted as hex from CSS.

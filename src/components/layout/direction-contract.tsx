/**
 * Direction contract (T15 AC-2; identity amended by T19 to the client brand
 * palette — greens + orange CTA — while keeping T15's frame grammar).
 *
 * Emits the committed 5-block direction contract (THESIS / OWN-WORLD / STORY /
 * FIRST VIEWPORT / FORM + FINISH line) as a REAL HTML comment in the emitted
 * storefront markup, so it survives the production build and is greppable in the
 * built output (`d43cafe8`). A JSX curly-brace comment is a compiler construct
 * and is stripped before render — it never reaches the DOM. Rendering the
 * comment through `dangerouslySetInnerHTML` on a zero-footprint wrapper is the
 * reliable way to place a literal HTML comment node in server-rendered HTML.
 *
 * The wrapper is `hidden` + `aria-hidden` so it has zero visual/layout/a11y
 * footprint; only the comment inside it carries the payload.
 */
const DIRECTION_CONTRACT = `<!-- impeccable:direction-contract seed=d43cafe8 (T19 brand amendment)
 THESIS: PosturPro is a certified second-life workshop — the tiled-hall frame grammar
   of T15 recolored to the client's own brand — refusing both the white-grid
   e-commerce default and the rejected mockup's industrial-tag aesthetic.
 OWN-WORLD: Brand-green ledger on glaze white. Deep green (#094220) chrome and
   footer, brand green (#0f7f3c) focus/identity accents, mint (#e7f7ed) tints;
   one orange (#f95326) reserved exclusively for the primary CTA with a dark
   warm-brown foreground; product photos framed, never tinted.
 STORY: The shopper reads certification (grade tags, verified process), fair value
   (honest savings math, MXN side-by-side), and brand authority — and buys.
 FIRST VIEWPORT: Green-framed hero — display headline beside the framed hero image
   slot with the certification tag element; the single orange CTA carries the only
   warm color above the fold; verified stats strip beneath.
 FORM: Certified workshop hall (T15 grammar, T19 palette). seed key d43cafe8.
 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
   review, the verdict, and DESIGN.md (see its T19 amendment header). -->`;

export function DirectionContract() {
  return (
    <div
      hidden
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }}
    />
  );
}

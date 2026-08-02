/**
 * Direction contract (Casa de Azulejo, T15 AC-2).
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
const DIRECTION_CONTRACT = `<!-- impeccable:direction-contract seed=d43cafe8
 THESIS: PosturPro is a Mexican tiled hall — a curated sequence of cobalt-framed
   panels — refusing the white-grid e-commerce default and the black-serif luxury boutique.
 OWN-WORLD: Tin-glazed azulejo. Cobalt (#1545a2) line-and-wash on milk-white glaze
   (#f7fafe); grout-seam borders; roman-caps captions in cartouche frames; mustard
   reserved inside frames; product photos framed, never tinted.
 STORY: The shopper reads breadth (a hall of framed brand/category tiles), authority
   (measured, painted precision), and fair value (honest grout, no gloss) — and buys.
 FIRST VIEWPORT: Cobalt cartouche hero — roman-caps display headline on a cobalt scrim
   beside the framed hero image slot; primary CTA button lower-left; a tile wall of
   featured chairs begins just below the fold.
 FORM: Azulejo station hall (grounded #6). seed key d43cafe8.
 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
   review, the verdict, and DESIGN.md. -->`;

export function DirectionContract() {
  return (
    <div
      hidden
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }}
    />
  );
}

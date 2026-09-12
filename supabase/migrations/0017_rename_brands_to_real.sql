-- 0017 — Rename the placeholder catalog brands to the real ones (owner, 2026-09-12).
--
-- The seed shipped five FICTIONAL brands (ErgoVita, PosturTec, ConfortMax,
-- Nórdika, AeroFlex). The store actually sells Herman Miller, Steelcase, Haworth
-- and MillerKnoll. Renaming IN PLACE (same ids) keeps every product → brand link,
-- admin filter and order history intact; AeroFlex (the fifth) is folded into
-- Herman Miller and then removed. Idempotent: each step is guarded so re-running
-- (or running against a DB already carrying the real slugs) is a no-op.
-- Descriptions are es-MX storefront copy (brands.description is not localized).

begin;

-- 1. In-place renames (only when the target slug is still free).
update brands
   set slug = 'herman-miller',
       name = 'Herman Miller',
       description = 'Íconos de la ergonomía: Aeron, Embody, Sayl y Mirra.'
 where slug = 'ergovita'
   and not exists (select 1 from brands where slug = 'herman-miller');

update brands
   set slug = 'steelcase',
       name = 'Steelcase',
       description = 'Sillas de trabajo de alto rendimiento: Leap, Gesture y Think.'
 where slug = 'posturtec'
   and not exists (select 1 from brands where slug = 'steelcase');

update brands
   set slug = 'haworth',
       name = 'Haworth',
       description = 'Ergonomía adaptable y diseño responsable: Fern y Zody.'
 where slug = 'confortmax'
   and not exists (select 1 from brands where slug = 'haworth');

update brands
   set slug = 'millerknoll',
       name = 'MillerKnoll',
       description = 'Diseño de autor para oficina y hogar: Generation y ReGeneration.'
 where slug = 'nordika'
   and not exists (select 1 from brands where slug = 'millerknoll');

-- 2. Fold AeroFlex into Herman Miller, then drop the empty brand row.
update products
   set brand_id = (select id from brands where slug = 'herman-miller')
 where brand_id = (select id from brands where slug = 'aeroflex')
   and exists (select 1 from brands where slug = 'herman-miller');

delete from brands
 where slug = 'aeroflex'
   and not exists (select 1 from products where brand_id = brands.id);

commit;

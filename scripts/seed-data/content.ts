/**
 * Seed fixtures for data-backed static pages. Content is stored as data only;
 * there is no editing UI in Phase 1 (Phase 2). Keyed by slug for idempotency.
 */

export interface StaticPageSeed {
  slug: string;
  title: string;
  body: string;
}

export const STATIC_PAGES: StaticPageSeed[] = [
  {
    slug: "sobre-nosotros",
    title: "Sobre nosotros",
    body: "PosturPro es tu tienda especializada en sillas ergonómicas y de oficina en México.",
  },
  {
    slug: "envios-y-devoluciones",
    title: "Envíos y devoluciones",
    body: "Envíos a todo México. Tarifa plana de MX$500 y envío gratis en compras mayores a MX$10,000.",
  },
  {
    slug: "preguntas-frecuentes",
    title: "Preguntas frecuentes",
    body: "Resolvemos tus dudas sobre garantía, armado y tiempos de entrega.",
  },
  {
    slug: "contacto",
    title: "Contacto",
    body: "Escríbenos a hola@posturpro.mx o llámanos de lunes a viernes de 9:00 a 18:00.",
  },
];

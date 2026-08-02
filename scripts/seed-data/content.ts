/**
 * Seed fixtures for data-backed static pages (T13). Content is stored as data
 * only; there is no editing UI in Phase 1 (Phase 2). Keyed by slug for
 * idempotency (upsert on `slug`).
 *
 * All 9 pages (AC-3) are seeded with STRUCTURED es-MX placeholder copy following
 * the `StaticPageBody` plain-text protocol: a line beginning `## ` is a section
 * heading; blank lines separate paragraphs. Aviso de Privacidad and Términos are
 * headed legal placeholders (real legal text is a pending client input — see
 * PRODUCT_SPEC / Out of Scope), NOT a single sentence. The FAQ body uses the same
 * `## question` / paragraph-answer convention so each question becomes a
 * deep-linkable `<h2 id>`.
 *
 * English content (AC-4) is seeded into the generic `translations` table as
 * `EN_TRANSLATIONS` (locale `en`, entity_type `static_page`, field `title`/`body`).
 * A page with no `en` row falls back to its es-MX base at read time — but every
 * page here ships both, so the store is es-MX+en symmetric on launch.
 *
 * Slugs are single-sourced in `src/lib/config/static-pages.ts`; the invariant
 * test asserts this fixture covers exactly that set.
 */

/** English locale tag used for the translation overlay rows. */
export const EN_LOCALE = "en" as const;

/** entity_type used for static-page translation rows (matches the RLS policy). */
export const STATIC_PAGE_ENTITY_TYPE = "static_page" as const;

export interface StaticPageSeed {
  slug: string;
  /** es-MX base title. */
  title: string;
  /** es-MX base body (StaticPageBody plain-text protocol). */
  body: string;
  /** English overlay (seeded into `translations`; AC-4). */
  en: { title: string; body: string };
}

export const STATIC_PAGES: StaticPageSeed[] = [
  {
    slug: "sobre-nosotros",
    title: "Sobre nosotros",
    body: [
      "PosturPro es tu tienda especializada en sillas ergonómicas y de oficina en México. Seleccionamos cada modelo pensando en tu salud postural y en tu productividad diaria.",
      "",
      "## Nuestra misión",
      "Ayudarte a cuidar tu espalda con sillas que combinan ergonomía, calidad y diseño, a un precio justo.",
      "",
      "## Por qué elegirnos",
      "Trabajamos directamente con marcas reconocidas, ofrecemos garantía en todos nuestros productos y te acompañamos antes y después de tu compra.",
    ].join("\n"),
    en: {
      title: "About us",
      body: [
        "PosturPro is your specialist store for ergonomic and office chairs in Mexico. We select every model with your postural health and daily productivity in mind.",
        "",
        "## Our mission",
        "To help you care for your back with chairs that combine ergonomics, quality, and design at a fair price.",
        "",
        "## Why choose us",
        "We work directly with recognized brands, offer a warranty on every product, and support you before and after your purchase.",
      ].join("\n"),
    },
  },
  {
    slug: "envios",
    title: "Envíos",
    body: [
      "Enviamos a todo México a través de paqueterías de confianza.",
      "",
      "## Tarifas",
      "Tarifa plana de MX$500 por envío. El envío es gratis en compras mayores a MX$10,000.",
      "",
      "## Tiempos de entrega",
      "Los pedidos se procesan en 1 a 2 días hábiles y llegan en 3 a 7 días hábiles según tu ubicación.",
      "",
      "## Seguimiento",
      "Recibirás el número de guía por correo en cuanto tu pedido sea despachado.",
    ].join("\n"),
    en: {
      title: "Shipping",
      body: [
        "We ship throughout Mexico via trusted carriers.",
        "",
        "## Rates",
        "A flat rate of MX$500 per shipment. Shipping is free on orders over MX$10,000.",
        "",
        "## Delivery times",
        "Orders are processed within 1 to 2 business days and arrive in 3 to 7 business days depending on your location.",
        "",
        "## Tracking",
        "You'll receive your tracking number by email as soon as your order ships.",
      ].join("\n"),
    },
  },
  {
    slug: "devoluciones",
    title: "Devoluciones",
    body: [
      "Queremos que tu compra sea perfecta. Si algo no salió como esperabas, te ayudamos.",
      "",
      "## Plazo",
      "Aceptamos devoluciones dentro de los 30 días posteriores a la entrega, siempre que el producto esté en su estado original.",
      "",
      "## Cómo iniciar una devolución",
      "Escríbenos desde la página de contacto con tu número de pedido y el motivo. Te enviaremos las instrucciones de recolección.",
      "",
      "## Reembolsos",
      "Una vez recibido y revisado el producto, procesamos tu reembolso al método de pago original en un plazo de 5 a 10 días hábiles.",
    ].join("\n"),
    en: {
      title: "Returns",
      body: [
        "We want your purchase to be perfect. If something didn't turn out as expected, we'll help.",
        "",
        "## Window",
        "We accept returns within 30 days of delivery, provided the product is in its original condition.",
        "",
        "## How to start a return",
        "Write to us from the contact page with your order number and the reason. We'll send you pickup instructions.",
        "",
        "## Refunds",
        "Once we receive and inspect the product, we process your refund to the original payment method within 5 to 10 business days.",
      ].join("\n"),
    },
  },
  {
    slug: "garantia",
    title: "Garantía",
    body: [
      "Todas nuestras sillas cuentan con garantía del fabricante.",
      "",
      "## Cobertura",
      "La garantía cubre defectos de fabricación en materiales y mano de obra bajo uso normal. El periodo varía según la marca y el modelo.",
      "",
      "## Qué no cubre",
      "No cubre el desgaste normal, el mal uso, ni los daños por accidente o modificaciones no autorizadas.",
      "",
      "## Cómo hacer válida tu garantía",
      "Contáctanos con tu número de pedido y una descripción del problema. Coordinaremos la revisión con el fabricante.",
    ].join("\n"),
    en: {
      title: "Warranty",
      body: [
        "All our chairs come with a manufacturer's warranty.",
        "",
        "## Coverage",
        "The warranty covers manufacturing defects in materials and workmanship under normal use. The period varies by brand and model.",
        "",
        "## What it doesn't cover",
        "It does not cover normal wear, misuse, or damage from accidents or unauthorized modifications.",
        "",
        "## How to claim your warranty",
        "Contact us with your order number and a description of the problem. We'll coordinate the review with the manufacturer.",
      ].join("\n"),
    },
  },
  {
    slug: "preguntas-frecuentes",
    title: "Preguntas frecuentes",
    body: [
      "## ¿Cuánto tarda el envío?",
      "Los pedidos llegan en 3 a 7 días hábiles según tu ubicación, tras 1 a 2 días de procesamiento.",
      "",
      "## ¿Puedo devolver mi silla?",
      "Sí. Aceptamos devoluciones dentro de los 30 días posteriores a la entrega si el producto está en su estado original.",
      "",
      "## ¿Las sillas llegan armadas?",
      "La mayoría requiere un armado sencillo que puedes hacer en pocos minutos con las instrucciones incluidas.",
      "",
      "## ¿Qué métodos de pago aceptan?",
      "Aceptamos tarjetas de crédito y débito, además de pagos en efectivo y transferencia a través de nuestro procesador de pagos.",
      "",
      "## ¿Tienen tienda física?",
      "Sí, contamos con un showroom donde puedes probar las sillas en persona. Consulta la página de showroom para la dirección y el horario.",
    ].join("\n"),
    en: {
      title: "Frequently asked questions",
      body: [
        "## How long does shipping take?",
        "Orders arrive in 3 to 7 business days depending on your location, after 1 to 2 days of processing.",
        "",
        "## Can I return my chair?",
        "Yes. We accept returns within 30 days of delivery if the product is in its original condition.",
        "",
        "## Do the chairs arrive assembled?",
        "Most require simple assembly you can do in a few minutes with the included instructions.",
        "",
        "## What payment methods do you accept?",
        "We accept credit and debit cards, plus cash and bank-transfer payments through our payment processor.",
        "",
        "## Do you have a physical store?",
        "Yes, we have a showroom where you can try the chairs in person. See the showroom page for the address and hours.",
      ].join("\n"),
    },
  },
  {
    slug: "aviso-de-privacidad",
    title: "Aviso de privacidad",
    body: [
      "Este aviso de privacidad describe cómo PosturPro recopila, usa y protege tus datos personales. (Texto de referencia — el aviso legal definitivo será proporcionado por el responsable.)",
      "",
      "## Datos que recopilamos",
      "Recopilamos los datos que nos proporcionas al comprar o contactarnos: nombre, correo electrónico, dirección de envío y teléfono.",
      "",
      "## Uso de la información",
      "Usamos tus datos para procesar pedidos, gestionar envíos, brindarte soporte y, con tu consentimiento, enviarte comunicaciones sobre la tienda.",
      "",
      "## Con quién compartimos datos",
      "Compartimos datos únicamente con los proveedores necesarios para completar tu pedido, como paqueterías y el procesador de pagos.",
      "",
      "## Tus derechos",
      "Puedes solicitar el acceso, la rectificación, la cancelación o la oposición al tratamiento de tus datos escribiéndonos desde la página de contacto.",
    ].join("\n"),
    en: {
      title: "Privacy notice",
      body: [
        "This privacy notice describes how PosturPro collects, uses, and protects your personal data. (Reference text — the final legal notice will be provided by the store owner.)",
        "",
        "## Data we collect",
        "We collect the data you provide when purchasing or contacting us: name, email, shipping address, and phone number.",
        "",
        "## How we use the information",
        "We use your data to process orders, manage shipping, provide support, and — with your consent — send you communications about the store.",
        "",
        "## Who we share data with",
        "We share data only with the providers needed to complete your order, such as carriers and the payment processor.",
        "",
        "## Your rights",
        "You may request access, rectification, cancellation, or objection to the processing of your data by writing to us from the contact page.",
      ].join("\n"),
    },
  },
  {
    slug: "terminos",
    title: "Términos y condiciones",
    body: [
      "Estos términos y condiciones rigen el uso de la tienda PosturPro y la compra de productos. (Texto de referencia — los términos legales definitivos serán proporcionados por el responsable.)",
      "",
      "## Uso del sitio",
      "Al usar este sitio aceptas proporcionar información veraz y no utilizarlo con fines ilícitos.",
      "",
      "## Precios y disponibilidad",
      "Los precios están en pesos mexicanos e incluyen impuestos cuando corresponda. La disponibilidad de los productos puede cambiar sin previo aviso.",
      "",
      "## Pedidos y pagos",
      "Un pedido se confirma una vez recibido el pago. Nos reservamos el derecho de cancelar pedidos con errores evidentes de precio o de existencias.",
      "",
      "## Limitación de responsabilidad",
      "PosturPro no será responsable por daños indirectos derivados del uso del sitio o de los productos más allá de lo establecido por la ley aplicable.",
    ].join("\n"),
    en: {
      title: "Terms and conditions",
      body: [
        "These terms and conditions govern the use of the PosturPro store and the purchase of products. (Reference text — the final legal terms will be provided by the store owner.)",
        "",
        "## Use of the site",
        "By using this site you agree to provide truthful information and not to use it for unlawful purposes.",
        "",
        "## Prices and availability",
        "Prices are in Mexican pesos and include taxes where applicable. Product availability may change without notice.",
        "",
        "## Orders and payments",
        "An order is confirmed once payment is received. We reserve the right to cancel orders with obvious pricing or stock errors.",
        "",
        "## Limitation of liability",
        "PosturPro will not be liable for indirect damages arising from use of the site or products beyond what applicable law establishes.",
      ].join("\n"),
    },
  },
  {
    slug: "contacto",
    title: "Contacto",
    body: [
      "¿Tienes una pregunta sobre nuestras sillas, tu pedido o una devolución? Escríbenos y te responderemos lo antes posible.",
      "",
      "## Horario de atención",
      "Lunes a viernes, de 9:00 a 18:00 (hora del centro de México).",
    ].join("\n"),
    en: {
      title: "Contact",
      body: [
        "Have a question about our chairs, your order, or a return? Write to us and we'll reply as soon as we can.",
        "",
        "## Support hours",
        "Monday to Friday, 9:00 to 18:00 (Central Mexico time).",
      ].join("\n"),
    },
  },
  {
    slug: "showroom",
    title: "Showroom",
    body: [
      "Visítanos y prueba nuestras sillas en persona antes de comprar.",
      "",
      "## Dirección",
      "Av. Ejemplo 123, Col. Centro, 06000 Ciudad de México, CDMX. (Dirección de referencia — se actualizará con la ubicación real.)",
      "",
      "## Horario",
      "Lunes a viernes: 9:00 a 18:00. Sábados: 10:00 a 14:00. Domingos: cerrado.",
    ].join("\n"),
    en: {
      title: "Showroom",
      body: [
        "Visit us and try our chairs in person before you buy.",
        "",
        "## Address",
        "Av. Ejemplo 123, Col. Centro, 06000 Mexico City, CDMX. (Reference address — to be updated with the real location.)",
        "",
        "## Hours",
        "Monday to Friday: 9:00 to 18:00. Saturday: 10:00 to 14:00. Sunday: closed.",
      ].join("\n"),
    },
  },
];

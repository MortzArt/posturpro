/**
 * Seed fixtures for products + variants + images.
 *
 * Money is integer cents (MXN centavos) throughout. Products are keyed by
 * stable slug/SKU for idempotent upserts. Every product has ≥1 color variant;
 * at least one variant has `priceOverrideCents = null` (inherits base price)
 * and at least one has an explicit override (edge case 5). At least one
 * product has a single variant and at least one has several (edge case 7).
 */
import { SEED_IMAGE_BASE_URL } from "@/lib/config";

export interface VariantSeed {
  skuSuffix: string;
  colorName: string;
  colorHex: string;
  /** null => inherit product base price; number => override (cents). */
  priceOverrideCents: number | null;
  stock: number;
}

export interface ProductSeed {
  slug: string;
  name: string;
  description: string;
  brandSlug: string;
  styleSlug: string;
  categorySlugs: string[];
  tagSlugs: string[];
  sku: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  costPriceCents: number;
  stock: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  seatHeightMm: number;
  weightG: number;
  materialFrame: string;
  materialUpholstery: string;
  materialFinish: string;
  isFeatured: boolean;
  isBestSeller: boolean;
  salesCount: number;
  variants: VariantSeed[];
}

/**
 * Deterministic placeholder image URL for a product or variant.
 *
 * `seedImageUrl("silla-x", 1)` -> a product-level image;
 * `seedImageUrl("silla-x", 1, "negro")` -> a distinct variant-specific image.
 * The seed string is embedded in the path so picsum returns a stable image and
 * `(product_id, url)` stays unique per (product, variant, index).
 */
export function seedImageUrl(
  productSlug: string,
  index: number,
  variantKey?: string,
): string {
  const seed = variantKey
    ? `${productSlug}-${variantKey}-${index}`
    : `${productSlug}-${index}`;
  return `${SEED_IMAGE_BASE_URL}/${seed}/800/800`;
}

const COLORS = {
  negro: { name: "Negro", hex: "#111111" },
  gris: { name: "Gris", hex: "#6B7280" },
  azul: { name: "Azul", hex: "#1D4ED8" },
  rojo: { name: "Rojo", hex: "#B91C1C" },
  blanco: { name: "Blanco", hex: "#F3F4F6" },
  cafe: { name: "Café", hex: "#6B4423" },
} as const;

type ColorKey = keyof typeof COLORS;

function variant(
  skuSuffix: string,
  color: ColorKey,
  priceOverrideCents: number | null,
  stock: number,
): VariantSeed {
  return {
    skuSuffix,
    colorName: COLORS[color].name,
    colorHex: COLORS[color].hex,
    priceOverrideCents,
    stock,
  };
}

const BRAND_CYCLE = ["ergovita", "posturtec", "confortmax", "nordika", "aeroflex"];
const STYLE_BY_CATEGORY: Record<string, string> = {
  ejecutivas: "ejecutiva",
  gamer: "gamer",
  ergonomicas: "ergonomica",
  hogar: "minimalista",
  visitas: "clasica",
  oficina: "ergonomica",
};

interface ProductBlueprint {
  slug: string;
  name: string;
  category: string;
  priceCents: number;
  tags: string[];
  /** number of color variants; the first one inherits (null override). */
  colors: ColorKey[];
  featured?: boolean;
  bestSeller?: boolean;
  salesCount?: number;
}

// 30 realistic Spanish-named chairs across categories.
const BLUEPRINTS: ProductBlueprint[] = [
  { slug: "silla-ejecutiva-milano", name: "Silla Ejecutiva Milano", category: "ejecutivas", priceCents: 899900, tags: ["piel", "soporte-lumbar", "giratoria"], colors: ["negro", "cafe"], featured: true, bestSeller: true, salesCount: 320 },
  { slug: "silla-ejecutiva-torino", name: "Silla Ejecutiva Torino", category: "ejecutivas", priceCents: 749900, tags: ["piel", "reclinable"], colors: ["negro", "cafe", "gris"], bestSeller: true, salesCount: 210 },
  { slug: "silla-ejecutiva-verona", name: "Silla Ejecutiva Verona", category: "ejecutivas", priceCents: 1199900, tags: ["piel", "reposacabezas", "soporte-lumbar"], colors: ["negro"], featured: true, salesCount: 95 },
  { slug: "silla-directiva-roma", name: "Silla Directiva Roma", category: "ejecutivas", priceCents: 1049900, tags: ["piel", "reclinable", "reposacabezas"], colors: ["negro", "cafe"], salesCount: 60 },
  { slug: "silla-ergonomica-aire", name: "Silla Ergonómica Aire", category: "ergonomicas", priceCents: 649900, tags: ["malla", "soporte-lumbar", "reposabrazos-4d"], colors: ["negro", "gris", "azul"], featured: true, bestSeller: true, salesCount: 540 },
  { slug: "silla-ergonomica-vertebra", name: "Silla Ergonómica Vértebra", category: "ergonomicas", priceCents: 829900, tags: ["malla", "soporte-lumbar", "reposacabezas", "reposabrazos-4d"], colors: ["negro", "gris"], bestSeller: true, salesCount: 410 },
  { slug: "silla-ergonomica-postura-pro", name: "Silla Ergonómica Postura Pro", category: "ergonomicas", priceCents: 999900, tags: ["malla", "reposacabezas", "reposabrazos-4d", "reclinable"], colors: ["negro", "gris", "blanco"], featured: true, salesCount: 180 },
  { slug: "silla-ergonomica-flexa", name: "Silla Ergonómica Flexa", category: "ergonomicas", priceCents: 549900, tags: ["malla", "soporte-lumbar"], colors: ["negro", "azul"], salesCount: 140 },
  { slug: "silla-ergonomica-lumbar-plus", name: "Silla Ergonómica Lumbar Plus", category: "ergonomicas", priceCents: 719900, tags: ["malla", "soporte-lumbar", "giratoria"], colors: ["negro", "gris", "rojo"], salesCount: 220 },
  { slug: "silla-gamer-titan", name: "Silla Gamer Titán", category: "gamer", priceCents: 599900, tags: ["piel", "reclinable", "reposacabezas"], colors: ["negro", "rojo", "azul"], featured: true, bestSeller: true, salesCount: 480 },
  { slug: "silla-gamer-nitro", name: "Silla Gamer Nitro", category: "gamer", priceCents: 549900, tags: ["piel", "reclinable"], colors: ["negro", "rojo"], bestSeller: true, salesCount: 360 },
  { slug: "silla-gamer-vortex", name: "Silla Gamer Vórtex", category: "gamer", priceCents: 679900, tags: ["piel", "reclinable", "reposacabezas", "reposabrazos-4d"], colors: ["negro", "azul", "rojo"], salesCount: 200 },
  { slug: "silla-gamer-fenix", name: "Silla Gamer Fénix", category: "gamer", priceCents: 499900, tags: ["piel", "reclinable"], colors: ["negro", "rojo"], salesCount: 150 },
  { slug: "silla-gamer-cobra", name: "Silla Gamer Cobra", category: "gamer", priceCents: 629900, tags: ["piel", "reclinable", "reposacabezas"], colors: ["negro", "azul"], salesCount: 90 },
  { slug: "silla-oficina-basica-nova", name: "Silla de Oficina Nova", category: "oficina", priceCents: 249900, tags: ["malla", "giratoria"], colors: ["negro", "gris"], bestSeller: true, salesCount: 620 },
  { slug: "silla-oficina-nova-plus", name: "Silla de Oficina Nova Plus", category: "oficina", priceCents: 329900, tags: ["malla", "soporte-lumbar", "giratoria"], colors: ["negro", "gris", "azul"], salesCount: 300 },
  { slug: "silla-oficina-compacta-mini", name: "Silla de Oficina Compacta Mini", category: "oficina", priceCents: 199900, tags: ["malla", "giratoria"], colors: ["negro"], salesCount: 250 },
  { slug: "silla-oficina-task-pro", name: "Silla de Oficina Task Pro", category: "oficina", priceCents: 389900, tags: ["malla", "reposabrazos-4d", "soporte-lumbar"], colors: ["negro", "gris", "blanco"], salesCount: 175 },
  { slug: "silla-oficina-eco", name: "Silla de Oficina Eco", category: "oficina", priceCents: 179900, tags: ["malla", "giratoria"], colors: ["negro", "gris"], salesCount: 130 },
  { slug: "silla-hogar-estudio-lund", name: "Silla de Estudio Lund", category: "hogar", priceCents: 289900, tags: ["malla", "giratoria"], colors: ["blanco", "gris", "negro"], featured: true, salesCount: 210 },
  { slug: "silla-hogar-nordic-oslo", name: "Silla Nórdica Oslo", category: "hogar", priceCents: 349900, tags: ["giratoria", "soporte-lumbar"], colors: ["blanco", "gris"], salesCount: 160 },
  { slug: "silla-hogar-copenhague", name: "Silla Copenhague", category: "hogar", priceCents: 269900, tags: ["giratoria"], colors: ["blanco", "cafe"], salesCount: 110 },
  { slug: "silla-hogar-estocolmo", name: "Silla Estocolmo", category: "hogar", priceCents: 319900, tags: ["giratoria", "soporte-lumbar"], colors: ["gris", "azul"], salesCount: 95 },
  { slug: "silla-hogar-bergen", name: "Silla Bergen", category: "hogar", priceCents: 239900, tags: ["giratoria"], colors: ["blanco", "negro"], salesCount: 80 },
  { slug: "silla-visitas-cliente", name: "Silla de Visitas Cliente", category: "visitas", priceCents: 149900, tags: ["sin-ruedas", "piel"], colors: ["negro", "cafe"], salesCount: 300 },
  { slug: "silla-visitas-sala", name: "Silla de Visitas Sala", category: "visitas", priceCents: 129900, tags: ["sin-ruedas", "malla"], colors: ["negro", "gris"], salesCount: 240 },
  { slug: "silla-visitas-recepcion", name: "Silla de Recepción", category: "visitas", priceCents: 169900, tags: ["sin-ruedas", "piel"], colors: ["negro", "cafe", "gris"], salesCount: 130 },
  { slug: "silla-visitas-conferencia", name: "Silla de Conferencia", category: "visitas", priceCents: 189900, tags: ["sin-ruedas", "malla", "soporte-lumbar"], colors: ["negro", "gris"], salesCount: 100 },
  { slug: "silla-visitas-lounge", name: "Silla Lounge", category: "visitas", priceCents: 219900, tags: ["sin-ruedas", "piel", "reclinable"], colors: ["cafe", "negro"], salesCount: 70 },
  { slug: "silla-ergonomica-kids-junior", name: "Silla Ergonómica Junior", category: "ergonomicas", priceCents: 279900, tags: ["malla", "soporte-lumbar", "giratoria"], colors: ["azul", "rojo", "gris"], salesCount: 90 },
];

function buildProduct(bp: ProductBlueprint, index: number): ProductSeed {
  const brandSlug = BRAND_CYCLE[index % BRAND_CYCLE.length];
  const styleSlug = STYLE_BY_CATEGORY[bp.category] ?? "ergonomica";
  // The "oficina" parent category also gets the child links where relevant;
  // ejecutivas products additionally belong to the oficina parent.
  const categorySlugs =
    bp.category === "ejecutivas" ? ["oficina", "ejecutivas"] : [bp.category];

  const variants: VariantSeed[] = bp.colors.map((color, colorIndex) => {
    // First variant inherits base price (null override); a later variant on
    // multi-color products carries an explicit override (+MX$300) so both
    // price paths exist in the data (edge case 5).
    const override =
      colorIndex === 1 && bp.colors.length > 1 ? bp.priceCents + 30_000 : null;
    return variant(`${index + 1}-${colorIndex + 1}`, color, override, 8 + colorIndex * 3);
  });

  const totalStock = variants.reduce((sum, variant_) => sum + variant_.stock, 0);

  return {
    slug: bp.slug,
    name: bp.name,
    description: `${bp.name}: comodidad y soporte de alta calidad para tu espacio.`,
    brandSlug,
    styleSlug,
    categorySlugs,
    tagSlugs: bp.tags,
    sku: `PP-${String(index + 1).padStart(4, "0")}`,
    priceCents: bp.priceCents,
    compareAtPriceCents:
      index % 3 === 0 ? Math.round(bp.priceCents * 1.2) : null,
    // Internal cost — ~55% of retail. Never exposed to the public role.
    costPriceCents: Math.round(bp.priceCents * 0.55),
    stock: totalStock,
    widthMm: 680,
    depthMm: 700,
    heightMm: 1180 + (index % 5) * 20,
    seatHeightMm: 450 + (index % 4) * 10,
    weightG: 15000 + (index % 6) * 1000,
    materialFrame: "Aluminio pulido",
    materialUpholstery: bp.tags.includes("piel") ? "Piel sintética" : "Malla transpirable",
    materialFinish: "Base de nylon reforzado",
    isFeatured: bp.featured ?? false,
    isBestSeller: bp.bestSeller ?? false,
    salesCount: bp.salesCount ?? 0,
    variants,
  };
}

export const PRODUCTS: ProductSeed[] = BLUEPRINTS.map(buildProduct);

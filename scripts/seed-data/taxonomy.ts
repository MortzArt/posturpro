/**
 * Seed fixtures for catalog taxonomy: brands, categories, styles, tags.
 * All keyed by stable natural keys (slug) so upserts are idempotent.
 */

export interface BrandSeed {
  slug: string;
  name: string;
  description: string;
}

export interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  /** slug of the parent category, or null for a root category. */
  parentSlug: string | null;
  sortOrder: number;
}

export interface StyleSeed {
  slug: string;
  name: string;
  description: string;
}

export interface TagSeed {
  slug: string;
  name: string;
}

export const BRANDS: BrandSeed[] = [
  {
    slug: "ergovita",
    name: "ErgoVita",
    description: "Sillas ergonómicas premium con soporte lumbar avanzado.",
  },
  {
    slug: "posturtec",
    name: "PosturTec",
    description: "Tecnología de postura para oficinas modernas.",
  },
  {
    slug: "confortmax",
    name: "ConfortMax",
    description: "Máximo confort para largas jornadas de trabajo.",
  },
  {
    slug: "nordika",
    name: "Nórdika",
    description: "Diseño escandinavo minimalista para el hogar y la oficina.",
  },
  {
    slug: "aeroflex",
    name: "AeroFlex",
    description: "Sillas de malla transpirable y estructura flexible.",
  },
];

export const CATEGORIES: CategorySeed[] = [
  {
    slug: "oficina",
    name: "Oficina",
    description: "Sillas para espacios de trabajo profesionales.",
    parentSlug: null,
    sortOrder: 1,
  },
  {
    slug: "ejecutivas",
    name: "Ejecutivas",
    description: "Sillas de piel y alto respaldo para dirección.",
    // Nested child of "oficina" (AC-13 requires ≥1 nested category).
    parentSlug: "oficina",
    sortOrder: 1,
  },
  {
    slug: "gamer",
    name: "Gamer",
    description: "Sillas deportivas para largas sesiones de juego.",
    parentSlug: null,
    sortOrder: 2,
  },
  {
    slug: "ergonomicas",
    name: "Ergonómicas",
    description: "Máximo soporte postural certificado.",
    parentSlug: null,
    sortOrder: 3,
  },
  {
    slug: "hogar",
    name: "Hogar",
    description: "Sillas de estudio y home office.",
    parentSlug: null,
    sortOrder: 4,
  },
  {
    slug: "visitas",
    name: "Visitas",
    description: "Sillas sin ruedas para salas de espera y reuniones.",
    parentSlug: null,
    sortOrder: 5,
  },
];

export const STYLES: StyleSeed[] = [
  { slug: "ejecutiva", name: "Ejecutiva", description: "Elegante y formal." },
  { slug: "ergonomica", name: "Ergonómica", description: "Soporte postural." },
  { slug: "gamer", name: "Gamer", description: "Deportiva y colorida." },
  { slug: "minimalista", name: "Minimalista", description: "Líneas limpias." },
  { slug: "industrial", name: "Industrial", description: "Metal y cuero." },
  { slug: "clasica", name: "Clásica", description: "Atemporal y sobria." },
];

export const TAGS: TagSeed[] = [
  { slug: "malla", name: "Malla" },
  { slug: "reposacabezas", name: "Reposacabezas" },
  { slug: "reposabrazos-4d", name: "Reposabrazos 4D" },
  { slug: "piel", name: "Piel" },
  { slug: "reclinable", name: "Reclinable" },
  { slug: "soporte-lumbar", name: "Soporte lumbar" },
  { slug: "giratoria", name: "Giratoria" },
  { slug: "sin-ruedas", name: "Sin ruedas" },
];

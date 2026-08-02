/**
 * Static-page READ-PATH + seed integration (T13 AC-1..AC-5, edges 1–3, 10)
 * against a LIVE local Supabase. Assumes the DB was reset + seeded by
 * `npm run test:integration` before this file runs (fresh 9 pages + 18
 * translations, no stale rows).
 *
 * These prove the live PostgREST/RLS contract the mocked unit tests cannot:
 *   1. `getStaticPageBySlug` reads the real es-MX base row (AC-2).
 *   2. The `en` translation overlay genuinely resolves through anon RLS — an
 *      English page is NOT silently falling back to Spanish (AC-4, real).
 *   3. Missing slug → `null` (edge 1); the caller `notFound()`s.
 *   4. `is_published = false` → anon RLS filters it → `null` (edge 2).
 *   5. A page WITHOUT an `en` overlay row falls back per-field to es-MX (edge 3).
 *   6. Seed idempotency for the 9 pages + 18 translations (re-run → no dupes).
 *
 * `next/cache` is mocked so `unstable_cache` is a passthrough in the node test
 * env (mirrors `admin-write-paths.integration.test.ts`).
 */
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `unstable_cache` needs a request store it doesn't have in bare node — make it
// a transparent passthrough so the real read logic runs against the live DB.
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
  revalidateTag: () => {},
}));

import { serviceClient, anonClient } from "./local-supabase";
import { getStaticPageBySlug } from "@/lib/content/static-pages";
import { ALL_STATIC_PAGE_SLUGS, STATIC_PAGE_SLUGS } from "@/lib/config";

const LOCAL_ANON_KEY_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
} as const;

// The wrapper's public client reads these at call time.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_ANON_KEY_ENV.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    LOCAL_ANON_KEY_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
});

const db = serviceClient();

/** A slug guaranteed NOT to collide with any seeded/reserved page. */
const UNPUBLISHED_SLUG = "qa-unpublished-fixture";
const NO_OVERLAY_SLUG = "qa-no-en-overlay-fixture";

describe("static_pages seeded rows (AC-1, AC-3)", () => {
  it("seeds exactly the 9 config-sourced slugs, all published", async () => {
    const { data, error } = await db
      .from("static_pages")
      .select("slug, is_published")
      .in("slug", [...ALL_STATIC_PAGE_SLUGS]);
    expect(error).toBeNull();
    expect(new Set((data ?? []).map((r) => r.slug))).toEqual(
      new Set(ALL_STATIC_PAGE_SLUGS),
    );
    for (const row of data ?? []) {
      expect(row.is_published).toBe(true);
    }
  });

  it("seeds an `en` translation overlay (title+body) for every page (AC-4)", async () => {
    const { data: pages } = await db
      .from("static_pages")
      .select("id, slug")
      .in("slug", [...ALL_STATIC_PAGE_SLUGS]);
    const ids = (pages ?? []).map((p) => p.id);
    const { data: overlays, error } = await db
      .from("translations")
      .select("entity_id, field")
      .eq("entity_type", "static_page")
      .eq("locale", "en")
      .in("entity_id", ids);
    expect(error).toBeNull();
    // 9 pages × {title, body} = 18 rows.
    expect(overlays ?? []).toHaveLength(18);
    for (const id of ids) {
      const fields = (overlays ?? [])
        .filter((o) => o.entity_id === id)
        .map((o) => o.field)
        .sort();
      expect(fields).toEqual(["body", "title"]);
    }
  });
});

describe("getStaticPageBySlug — existing slug (AC-2)", () => {
  it("reads the es-MX base title+body for a seeded slug", async () => {
    const page = await getStaticPageBySlug("sobre-nosotros", "es-MX");
    expect(page).not.toBeNull();
    expect(page?.title.length).toBeGreaterThan(0);
    expect(page?.body.length).toBeGreaterThan(0);
  });

  it("returns a resolved page for EVERY generic slug in es-MX", async () => {
    for (const slug of STATIC_PAGE_SLUGS) {
      const page = await getStaticPageBySlug(slug, "es-MX");
      expect(page, `es-MX/${slug}`).not.toBeNull();
      expect(page?.title.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("getStaticPageBySlug — en overlay genuinely resolves (AC-4)", () => {
  it("returns the ENGLISH title/body for /en, distinct from the es-MX base", async () => {
    const es = await getStaticPageBySlug("sobre-nosotros", "es-MX");
    const en = await getStaticPageBySlug("sobre-nosotros", "en");
    expect(en).not.toBeNull();
    // The en overlay row exists in the seed, so the English content must differ
    // from the Spanish base — proving the overlay is NOT silently falling back.
    expect(en?.title).not.toBe(es?.title);
    expect(en?.title.length ?? 0).toBeGreaterThan(0);
    expect(en?.body.length ?? 0).toBeGreaterThan(0);
  });
});

describe("getStaticPageBySlug — degrade-to-null (edges 1, 2)", () => {
  it("returns null for a slug that was never seeded (edge 1)", async () => {
    const page = await getStaticPageBySlug("does-not-exist-anywhere", "es-MX");
    expect(page).toBeNull();
  });

  it("returns null for an is_published = false row via anon RLS (edge 2)", async () => {
    // Seed a temporary UNPUBLISHED row with the service (RLS-bypassing) client.
    await db.from("static_pages").upsert(
      { slug: UNPUBLISHED_SLUG, title: "Hidden", body: "secret", is_published: false },
      { onConflict: "slug" },
    );
    try {
      // The wrapper reads via the anon public client — RLS filters unpublished.
      const page = await getStaticPageBySlug(UNPUBLISHED_SLUG, "es-MX");
      expect(page).toBeNull();
      // And a direct anon read confirms RLS (not just the wrapper's filter).
      const anon = anonClient();
      const { data } = await anon
        .from("static_pages")
        .select("slug")
        .eq("slug", UNPUBLISHED_SLUG);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await db.from("static_pages").delete().eq("slug", UNPUBLISHED_SLUG);
    }
  });
});

describe("getStaticPageBySlug — en fallback when overlay absent (edge 3)", () => {
  it("falls back per-field to the es-MX base when NO en translation row exists", async () => {
    // A PUBLISHED page with a base row but deliberately NO en translation rows.
    await db.from("static_pages").upsert(
      { slug: NO_OVERLAY_SLUG, title: "Solo español", body: "Cuerpo en español", is_published: true },
      { onConflict: "slug" },
    );
    try {
      const en = await getStaticPageBySlug(NO_OVERLAY_SLUG, "en");
      expect(en).not.toBeNull();
      // No overlay → the en request renders the es-MX base (never blank, never 404).
      expect(en?.title).toBe("Solo español");
      expect(en?.body).toBe("Cuerpo en español");
    } finally {
      await db.from("static_pages").delete().eq("slug", NO_OVERLAY_SLUG);
    }
  });
});

describe("seed idempotency for static pages + translations (AC-3)", () => {
  it("re-running the seed leaves the 9 pages + 18 translations unchanged (no dupes)", async () => {
    const before = await staticPageCounts();

    execFileSync("npm", ["run", "db:seed"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        ...LOCAL_ANON_KEY_ENV,
        SUPABASE_SECRET_KEY:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
      },
    });

    const after = await staticPageCounts();
    expect(after).toEqual(before);
    // And the seeded set is exactly the 9 config slugs (no stale extras from
    // this fresh-reset run).
    expect(after.pages).toBe(9);
    expect(after.translations).toBe(18);
  });
});

/** Count the seeded static pages + their en translation rows. */
async function staticPageCounts(): Promise<{ pages: number; translations: number }> {
  const { count: pages } = await db
    .from("static_pages")
    .select("id", { count: "exact", head: true })
    .in("slug", [...ALL_STATIC_PAGE_SLUGS]);
  const { data: ids } = await db
    .from("static_pages")
    .select("id")
    .in("slug", [...ALL_STATIC_PAGE_SLUGS]);
  const { count: translations } = await db
    .from("translations")
    .select("entity_id", { count: "exact", head: true })
    .eq("entity_type", "static_page")
    .eq("locale", "en")
    .in("entity_id", (ids ?? []).map((r) => r.id));
  return { pages: pages ?? 0, translations: translations ?? 0 };
}

afterAll(async () => {
  // Belt-and-suspenders cleanup of any fixture rows a failed test left behind.
  await db.from("static_pages").delete().eq("slug", UNPUBLISHED_SLUG);
  await db.from("static_pages").delete().eq("slug", NO_OVERLAY_SLUG);
});

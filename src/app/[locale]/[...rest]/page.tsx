import { notFound } from "next/navigation";

/**
 * Catch-all fallback for unmatched paths WITHIN a locale segment (T2 AC-10,
 * edge case 1). Without this, Next serves the shell-less root `not-found.tsx`
 * for a dead nav link like `/sillas`. This route matches any such path and
 * calls `notFound()`, which renders the localized `[locale]/not-found.tsx`
 * INSIDE the shell (header + footer). Owning tasks (T3 catalog, T13 pages)
 * introduce real routes at these paths, which take precedence over this
 * catch-all as they are added.
 */
export default function CatchAllNotFound() {
  notFound();
}

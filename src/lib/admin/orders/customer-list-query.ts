/**
 * Admin customer-list read (T12 AC-24). LIVE read via the admin client of a page
 * of `customers` ordered by `created_at DESC`, searchable by email OR name
 * (meta-char stripped, mirrors the orders/products search m-3). The per-customer
 * order count is a SINGLE grouped-count RPC (`admin_customer_order_counts`) — the
 * DB returns at most 25 count rows, never the underlying order rows, so counts
 * are correct at any scale and the read is bounded (M-3). `server-only`.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { lastPageFor, parsePageParam, rangeFor } from "@/lib/catalog/pagination";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/config";
import type { CustomerListFilters } from "@/lib/admin/orders/customer-list-filters";

/** One admin customer-list row. */
export interface AdminCustomerRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  orderCount: number;
}

/** The paginated customer-list result. */
export interface AdminCustomerListResult {
  rows: AdminCustomerRow[];
  totalCount: number;
  page: number;
  lastPage: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface FilterableQuery {
  or(filter: string): FilterableQuery;
}

/** Apply the search filter to a customers query (email OR name). */
function applySearch<T extends FilterableQuery>(query: T, search: string): T {
  if (!search) return query;
  const term = search.replace(/[%,()*.:\\]/g, " ");
  return query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`) as T;
}

/** Read a page of customers + their order counts. Never throws. */
export async function listAdminCustomers(
  filters: CustomerListFilters,
): Promise<AdminCustomerListResult> {
  const db = createAdminClient();

  const totalCount = await countCustomers(db, filters.search);
  const lastPage = lastPageFor(totalCount, ADMIN_PRODUCTS_PER_PAGE);
  const page = parsePageParam(filters.rawPage, lastPage);
  const { from, to } = rangeFor(page, ADMIN_PRODUCTS_PER_PAGE);

  const customers = await readCustomers(db, filters.search, from, to);
  const counts = await readOrderCounts(db, customers.map((customer) => customer.id));
  const rows = customers.map((customer) => ({ ...customer, orderCount: counts.get(customer.id) ?? 0 }));
  return { rows, totalCount, page, lastPage };
}

/** Count matching customers (head query) for pagination clamping. */
async function countCustomers(db: AdminClient, search: string): Promise<number> {
  const base = db.from("customers").select("id", { count: "exact", head: true });
  const query = applySearch(base as unknown as FilterableQuery, search);
  const { count, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-customers] count failed: ${error.message}`);
  return count ?? 0;
}

interface RawCustomerRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}

/** Read the ranged, ordered customers for the current page. */
async function readCustomers(
  db: AdminClient,
  search: string,
  from: number,
  to: number,
): Promise<Omit<AdminCustomerRow, "orderCount">[]> {
  const base = db
    .from("customers")
    .select("id, email, full_name, phone")
    .order("created_at", { ascending: false })
    .range(from, to);
  const query = applySearch(base as unknown as FilterableQuery, search);
  const { data, error } = await (query as unknown as typeof base);
  if (error) throw new Error(`[admin-customers] read failed: ${error.message}`);
  return ((data ?? []) as RawCustomerRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
  }));
}

/**
 * Grouped order counts for the page's customer ids via the
 * `admin_customer_order_counts` RPC — the DB does the aggregation, returning ONE
 * row per id (at most 25), so counts never truncate at PostgREST's 1000-row cap
 * and the read is bounded by page size, not total order volume (M-3).
 */
async function readOrderCounts(
  db: AdminClient,
  customerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (customerIds.length === 0) return counts;
  const { data, error } = await db.rpc("admin_customer_order_counts", {
    p_customer_ids: customerIds,
  });
  if (error) {
    console.error(`[admin-customers] order-count RPC failed: ${error.message}`);
    return counts;
  }
  for (const row of data ?? []) {
    counts.set(row.customer_id, Number(row.order_count));
  }
  return counts;
}

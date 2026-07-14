/**
 * Supabase database types for PosturPro — RE-EXPORT BARREL.
 *
 * HAND-MAINTAINED (not generated). This file and the modules under
 * `./types/` are authored BY HAND to match migrations 0001–0010 exactly, and
 * updated by hand with every new migration. The Supabase CLI is NOT linked
 * (the remote project is empty), so `supabase gen types` cannot produce this
 * file — the earlier "generated" header claim was false and has been removed.
 *
 * WHY A BARREL: the type definitions were split into cohesive domain modules
 * under `./types/` to keep every file under the 1,000-line hard cap (A1). This
 * barrel re-exports every name unchanged, so ALL existing import paths
 * (`@/lib/supabase/database.types`) keep working with no edits at any call site.
 *
 * REGENERATION IS A RECONCILIATION AID ONLY. `npm run db:types` runs
 * `supabase gen types typescript --local` — use its output ONLY to diff against
 * these hand-authored files when the schema changes. NEVER pipe it over the
 * maintained files: the generated output lacks the hand-authored domain aliases
 * (`ProductStatus`, `OrderStatus`, `TransitionKind`, …) and the RPC payload /
 * Args / Result `type` aliases (`CreateOrderPayload`, `AdvanceOrderStatusArgs`,
 * …) that the app depends on. The RPC Args/Result MUST stay `type` aliases — an
 * interface collapses the `Database` Functions generic to `never` (T8 gotcha).
 *
 * MONEY: all cents are INTEGER MXN centavos (see `src/lib/money.ts`).
 */
export type { Json } from "./types/json";
export type {
  ProductStatus,
  OrderStatus,
  PaymentStatus,
  DiscountType,
  TransitionKind,
} from "./types/enums";
export type {
  CreateOrderItemPayload,
  CreateOrderPayload,
  CreateOrderResult,
  AdvanceOrderStatusArgs,
  AdvanceOrderStatusResult,
  ClaimEmailSendArgs,
  FinalizeEmailSendArgs,
  RecordPaymentEventArgs,
  FinalizePaymentEventArgs,
  RecordRefundArgs,
  RecordRefundResult,
  RefundedTotalArgs,
} from "./types/rpc";
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Views,
} from "./types/database";

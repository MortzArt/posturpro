/**
 * The Supabase `Json` scalar. Split out of the hand-maintained
 * `database.types.ts` barrel (A1) so every module sharing it imports one source.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

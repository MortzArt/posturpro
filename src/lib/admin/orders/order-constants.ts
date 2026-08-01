/**
 * Non-secret, Next-import-free, server-free order constants (T12). Safe to import
 * from client components (bound lengths for the notes/tracking inputs) AND the
 * server-only write layers alike — the write modules re-export nothing secret
 * from here. Keeping these OUT of the `server-only` write modules avoids pulling
 * the admin client into a client bundle (the build enforces this).
 */

/** Max characters for an internal note (matches the 0012 DB CHECK 1..2000). */
export const INTERNAL_NOTE_MAX_LENGTH = 2000;

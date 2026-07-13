"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * A STABLE `aria-live` region for the filtered result count (M-7).
 *
 * The count is only known after the RPC resolves inside the results subtree,
 * which remounts on every filter change. A live region that is freshly
 * inserted into the DOM does not reliably announce — screen readers announce
 * TEXT CHANGES on a persistent node. So the region lives HERE, in the persistent
 * client shell (never remounts), and the remounting server subtree feeds it the
 * new count through {@link ResultCountAnnouncer}.
 *
 * The provider ALSO exposes the live numeric total so persistent client chrome
 * (the mobile FilterSheet "Ver N sillas" apply button, T5 design spec) can label
 * itself with the real filtered count — which is only knowable after the RPC and
 * therefore cannot be threaded down as a server prop to the client toolbar.
 */

interface ResultAnnouncerValue {
  announce: (message: string, count: number) => void;
  /** Live filtered total; `null` until the first results subtree reports. */
  resultCount: number | null;
}

const ResultAnnouncerContext = createContext<ResultAnnouncerValue | null>(null);

/**
 * Hosts the persistent visually-hidden live region and provides `announce` to
 * descendants. Mount once in the shell, above the results subtree.
 */
export function ResultAnnouncerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState("");
  const [resultCount, setResultCount] = useState<number | null>(null);

  const announce = useCallback<ResultAnnouncerValue["announce"]>(
    (next, count) => {
      // Force a change even when the text is identical to the last announcement,
      // so re-applying the same filter still re-announces (screen readers ignore
      // an unchanged node). A trailing zero-width space toggles per call.
      setMessage((prev) => (prev.endsWith("​") ? next : `${next}​`));
      setResultCount(count);
    },
    [],
  );

  return (
    <ResultAnnouncerContext.Provider value={{ announce, resultCount }}>
      {children}
      <p
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="result-count-live"
      >
        {message}
      </p>
    </ResultAnnouncerContext.Provider>
  );
}

/**
 * Rendered by the (remounting) results subtree; pushes the resolved count text
 * AND numeric total into the persistent region on mount / whenever it changes.
 * Renders nothing.
 */
export function ResultCountAnnouncer({
  text,
  count,
}: {
  text: string;
  count: number;
}) {
  const ctx = useContext(ResultAnnouncerContext);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (ctx === null) return;
    if (lastRef.current === text) return;
    lastRef.current = text;
    ctx.announce(text, count);
  }, [ctx, text, count]);

  return null;
}

/**
 * Read the live filtered total (persistent client chrome, e.g. the FilterSheet
 * apply button). Returns `null` until the first results subtree reports — the
 * consumer decides its fallback label for that first paint.
 */
export function useResultCount(): number | null {
  const ctx = useContext(ResultAnnouncerContext);
  return ctx?.resultCount ?? null;
}

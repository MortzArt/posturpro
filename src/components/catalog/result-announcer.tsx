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
 * The count is only known after the RPC resolves inside the page's `<Suspense>`,
 * whose subtree remounts on every filter change. A live region that is freshly
 * inserted into the DOM does not reliably announce — screen readers announce
 * TEXT CHANGES on a persistent node. So the region lives HERE, in the persistent
 * client shell (never remounts), and the remounting server subtree feeds it the
 * new count through {@link ResultCountAnnouncer}, which just calls `announce`.
 */

type AnnounceFn = (message: string) => void;

const ResultAnnouncerContext = createContext<AnnounceFn | null>(null);

/**
 * Hosts the persistent visually-hidden live region and provides `announce` to
 * descendants. Mount once in the shell, above the Suspense boundary.
 */
export function ResultAnnouncerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState("");

  const announce = useCallback<AnnounceFn>((next) => {
    // Force a change even when the text is identical to the last announcement,
    // so re-applying the same filter still re-announces (screen readers ignore
    // an unchanged node). A trailing zero-width space toggles per call.
    setMessage((prev) => (prev.endsWith("​") ? next : `${next}​`));
  }, []);

  return (
    <ResultAnnouncerContext.Provider value={announce}>
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
 * into the persistent region on mount / whenever it changes. Renders nothing.
 */
export function ResultCountAnnouncer({ text }: { text: string }) {
  const announce = useContext(ResultAnnouncerContext);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (announce === null) return;
    if (lastRef.current === text) return;
    lastRef.current = text;
    announce(text);
  }, [announce, text]);

  return null;
}

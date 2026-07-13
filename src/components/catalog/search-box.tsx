"use client";

import { useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { SEARCH_PARAM_KEYS } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * SearchBox (T5 AC-12). Keyword search entry that submits to `/sillas?q=…`.
 *
 * SSR-FIRST: the underlying `<form method="get" action={action}>` submits
 * natively with JS disabled (edge 11). JS only enhances the header collapse
 * toggle and the clear affordance — search itself never depends on it. Autocomplete
 * is Out of Scope (submit-based only), so there is no live query / debounce.
 *
 * Two placements:
 * - `variant="header"` — collapses to an icon button below `md`; tapping it
 *   expands to a full-width input and autofocuses.
 * - `variant="toolbar"` — always expanded, fills its column, echoes the active
 *   `q` on `/sillas`.
 *
 * `preservedParams` become hidden inputs so submitting a new query from the
 * toolbar keeps the shopper's active filters. `page` is intentionally NOT
 * preserved — a new query resets to page 1 (AC-8).
 */

interface SearchBoxProps {
  placeholder: string;
  ariaLabel: string;
  clearLabel: string;
  submitLabel: string;
  openLabel: string;
  defaultValue?: string;
  action: string;
  variant?: "header" | "toolbar";
  preservedParams?: Record<string, string>;
  className?: string;
}

/** The `q` param name, single-sourced from config so it never drifts from the
 * parser's `SEARCH_PARAM_KEYS.q` (config.ts is not `server-only`). */
const QUERY_FIELD = SEARCH_PARAM_KEYS.q;

export function SearchBox({
  placeholder,
  ariaLabel,
  clearLabel,
  submitLabel,
  openLabel,
  defaultValue = "",
  action,
  variant = "toolbar",
  preservedParams,
  className,
}: SearchBoxProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [expanded, setExpanded] = useState(false);

  // Re-sync the controlled field when the active query changes out from under
  // us (chip removal / Clear-all navigation re-renders with a new defaultValue
  // but `useState` initializers do not re-run) — M-4. React's recommended
  // "adjust state during render" pattern (no effect): track the prop we last
  // synced from and correct `value` in the same render it changes.
  const [syncedDefault, setSyncedDefault] = useState(defaultValue);
  if (syncedDefault !== defaultValue) {
    setSyncedDefault(defaultValue);
    setValue(defaultValue);
  }

  const isHeader = variant === "header";
  const showInput = !isHeader || expanded;

  const openSearch = (): void => {
    setExpanded(true);
    // Focus after the input renders/expands.
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clear = (): void => {
    const hadActiveQuery = defaultValue.length > 0;
    setValue("");
    inputRef.current?.focus();
    // If we're on a results page with an active `q`, clearing must also clear
    // the active search — submit the (now-empty) form so the URL drops `q` and
    // re-queries (M-5). The empty `q` is dropped by the parser; preserved
    // filters ride along as hidden inputs. Native submit = works JS-off too.
    if (hadActiveQuery) {
      window.requestAnimationFrame(() => formRef.current?.requestSubmit());
    }
  };

  if (isHeader && !expanded) {
    return (
      <button
        type="button"
        data-testid="search-open"
        aria-label={openLabel}
        onClick={openSearch}
        className={cn(
          "nav-hover inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground outline-none md:hidden",
          "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <HugeiconsIcon icon={Search01Icon} size={20} strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      role="search"
      data-testid="search-form"
      className={cn(
        "relative flex items-center",
        showInput ? "w-full" : "",
        className,
      )}
    >
      {preservedParams
        ? Object.entries(preservedParams)
            // Never re-emit `q` (the field owns it) or `page` (a new query resets
            // to page 1) — guards against a caller doubling the query param (m-5).
            .filter(
              ([name]) =>
                name !== SEARCH_PARAM_KEYS.q && name !== SEARCH_PARAM_KEYS.page,
            )
            .map(([name, paramValue]) => (
              <input key={name} type="hidden" name={name} value={paramValue} />
            ))
        : null}

      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>

      <HugeiconsIcon
        icon={Search01Icon}
        size={18}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute left-3 text-muted-foreground"
      />

      <Input
        id={inputId}
        ref={inputRef}
        type="search"
        name={QUERY_FIELD}
        data-testid="search-input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        // Native `type=search` shows a UA clear button; hide ours redundancy by
        // keeping the custom one for consistent styling + JS-off submit.
        className="h-11 w-full rounded-md pl-9 pr-16"
        autoComplete="off"
        enterKeyHint="search"
      />

      {value.length > 0 ? (
        <button
          type="button"
          data-testid="search-clear"
          aria-label={clearLabel}
          onClick={clear}
          className={cn(
            "clear-fade absolute right-10 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none",
            "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      <button
        type="submit"
        data-testid="search-submit"
        aria-label={submitLabel}
        className={cn(
          "absolute right-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none",
          "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={2} aria-hidden />
      </button>
    </form>
  );
}

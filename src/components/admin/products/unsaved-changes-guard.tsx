"use client";

import { useEffect } from "react";

/**
 * UnsavedChangesGuard (T11 Slice 2, edge 8) — warns on hard navigation
 * (`beforeunload`) when the form has unsaved edits. The in-app "Cancelar"
 * confirm is handled by the form's router push + (future) alert-dialog; this
 * covers tab-close / reload / address-bar navigation. No autosave in Phase 1.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePointerReorder (T11 Slice 3/4) — native Pointer Events single-axis reorder
 * with a movement threshold, `setPointerCapture`, and a live drop index. No
 * `@dnd-kit`; the keyboard path (↑/↓ buttons) is the guaranteed a11y route and
 * lives in the component. The hook is generic over the item id type (string).
 *
 * It reports the current drag state (which id is grabbed, the pointer-relative
 * transform, and the target drop index) so the component can render the lifted
 * card + shifted siblings. On release it calls `onCommit(orderedIds)` if the
 * order changed. Interruptible: a new pointerdown restarts tracking.
 */
const DRAG_THRESHOLD_PX = 6;

interface ReorderState {
  draggingId: string | null;
  pointerY: number;
  startY: number;
  dropIndex: number;
}

const IDLE: ReorderState = { draggingId: null, pointerY: 0, startY: 0, dropIndex: -1 };

export interface PointerReorder {
  draggingId: string | null;
  dropIndex: number;
  offsetY: number;
  onHandlePointerDown: (event: React.PointerEvent, id: string) => void;
}

export function usePointerReorder(
  ids: string[],
  itemHeight: number,
  onCommit: (orderedIds: string[]) => void,
): PointerReorder {
  const [state, setState] = useState<ReorderState>(IDLE);
  const idsRef = useRef(ids);
  // Keep the latest ids in a ref (effect, not render) so the pointer handlers
  // read the current order without re-creating the callback on every reorder.
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);
  const activeRef = useRef(false);

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent, id: string): void => {
      if (activeRef.current) return; // Ignore multi-touch once a drag is active.
      event.preventDefault();
      const handle = event.currentTarget as HTMLElement;
      handle.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      let committed = false;

      const onMove = (moveEvent: PointerEvent): void => {
        const delta = moveEvent.clientY - startY;
        if (!committed && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
        committed = true;
        activeRef.current = true;
        const currentIndex = idsRef.current.indexOf(id);
        const rawTarget = currentIndex + Math.round(delta / itemHeight);
        const dropIndex = Math.max(0, Math.min(idsRef.current.length - 1, rawTarget));
        setState({ draggingId: id, pointerY: moveEvent.clientY, startY, dropIndex });
      };

      const onUp = (): void => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        if (committed) {
          const from = idsRef.current.indexOf(id);
          setState((prev) => {
            const to = prev.dropIndex;
            if (from !== -1 && to !== -1 && from !== to) {
              const next = [...idsRef.current];
              next.splice(from, 1);
              next.splice(to, 0, id);
              onCommit(next);
            }
            return IDLE;
          });
        }
        activeRef.current = false;
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [itemHeight, onCommit],
  );

  const offsetY = state.draggingId ? state.pointerY - state.startY : 0;
  return { draggingId: state.draggingId, dropIndex: state.dropIndex, offsetY, onHandlePointerDown };
}

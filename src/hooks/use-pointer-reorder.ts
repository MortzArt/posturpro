"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePointerReorder (T11 Slice 3/4) — native Pointer Events reorder for a list
 * laid out in ANY direction (row, wrapped grid, column). No `@dnd-kit`; the
 * keyboard path (↑/↓ buttons) is the guaranteed a11y route and lives in the
 * component.
 *
 * Mechanics: on pointerdown the hook snapshots the centre of every item in the
 * container (elements carrying `data-reorder-id`). While dragging, the drop
 * index is the snapshot item whose centre is nearest the pointer — so a card
 * dragged sideways along a row, or down onto the next wrapped row, lands where
 * it visually points. (The previous version divided the vertical delta by a
 * fixed card height, which only ever worked for a single column.) The lifted
 * card follows the pointer on both axes via `offset`. On release it calls
 * `onCommit(orderedIds)` if the order changed. Interruptible: a new pointerdown
 * restarts tracking.
 */
const DRAG_THRESHOLD_PX = 6;

interface ItemCenter {
  id: string;
  x: number;
  y: number;
}

interface ReorderState {
  draggingId: string | null;
  offset: { x: number; y: number };
  dropIndex: number;
}

const NO_OFFSET = { x: 0, y: 0 } as const;
const IDLE: ReorderState = { draggingId: null, offset: NO_OFFSET, dropIndex: -1 };

export interface PointerReorder {
  draggingId: string | null;
  dropIndex: number;
  /** Pointer-relative translation of the lifted item (both axes). */
  offset: { x: number; y: number };
  onHandlePointerDown: (event: React.PointerEvent, id: string) => void;
}

/** Snapshot each item's centre, in DOM order, from the container. */
function snapshotCenters(container: HTMLElement | null): ItemCenter[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>("[data-reorder-id]")).flatMap((el) => {
    const id = el.dataset.reorderId;
    if (!id) return [];
    const rect = el.getBoundingClientRect();
    return [{ id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }];
  });
}

/** Index of the snapshot centre nearest the pointer (-1 when there are none). */
function nearestIndex(centers: readonly ItemCenter[], px: number, py: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = (center.x - px) ** 2 + (center.y - py) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

export function usePointerReorder(
  ids: string[],
  /** The element that wraps every `data-reorder-id` item (owned by the component). */
  containerRef: React.RefObject<HTMLElement | null>,
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
  // The live drop index also lives in a ref so `onUp` can commit OUTSIDE a state
  // updater — React may defer or re-run updater functions, so side effects
  // (`onCommit` → setState + a server action) must never run inside one.
  const dropIndexRef = useRef(-1);

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent, id: string): void => {
      if (activeRef.current) return; // Ignore multi-touch once a drag is active.
      event.preventDefault();
      const handle = event.currentTarget as HTMLElement;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const centers = snapshotCenters(containerRef.current);
      let committed = false;

      const onMove = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!committed && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        committed = true;
        activeRef.current = true;
        const hit = nearestIndex(centers, moveEvent.clientX, moveEvent.clientY);
        const dropIndex = hit === -1 ? idsRef.current.indexOf(id) : hit;
        dropIndexRef.current = dropIndex;
        setState({ draggingId: id, offset: { x: dx, y: dy }, dropIndex });
      };

      const onUp = (): void => {
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        if (committed) {
          const from = idsRef.current.indexOf(id);
          const to = dropIndexRef.current;
          setState(IDLE);
          if (from !== -1 && to !== -1 && from !== to) {
            const next = [...idsRef.current];
            next.splice(from, 1);
            next.splice(to, 0, id);
            onCommit(next);
          }
        }
        dropIndexRef.current = -1;
        activeRef.current = false;
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [containerRef, onCommit],
  );

  return {
    draggingId: state.draggingId,
    dropIndex: state.dropIndex,
    offset: state.offset,
    onHandlePointerDown,
  };
}

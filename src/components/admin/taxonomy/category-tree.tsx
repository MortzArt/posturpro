"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CategoryRow } from "@/lib/admin/taxonomy/taxonomy-read";

/**
 * CategoryTree (T11 Slice 5, AC-22/23) — recursive nested category view with
 * expand/collapse, edit, and delete. `role="tree"` semantics; a node knows
 * whether it has children (drives the delete restrict pre-check). Re-parenting
 * is done via the edit dialog's parent select (the accessible path). Client
 * component (local expand state).
 */
interface CategoryTreeProps {
  categories: CategoryRow[];
  onEdit: (category: CategoryRow) => void;
  onDelete: (category: CategoryRow, hasChildren: boolean) => void;
}

interface TreeNode {
  category: CategoryRow;
  children: TreeNode[];
}

/** A node flattened in visible (DOM) order — the sequence arrow keys walk. */
interface FlatNode {
  id: string;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  parentId: string | null;
}

export function CategoryTree({ categories, onEdit, onDelete }: CategoryTreeProps) {
  const roots = useMemo(() => buildTree(categories), [categories]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));
  // Roving-tabindex target: exactly one treeitem is tabbable at a time (ARIA
  // APG tree pattern). Defaults to the first root; arrow keys move it.
  const [activeId, setActiveId] = useState<string | null>(() => roots[0]?.category.id ?? null);
  const treeRef = useRef<HTMLUListElement>(null);

  const toggle = useCallback((id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Visible nodes in top-to-bottom order (collapsed subtrees excluded) — the
  // list ArrowUp/ArrowDown/Home/End walk.
  const flat = useMemo(() => flattenVisible(roots, expanded), [roots, expanded]);
  const activeIndex = flat.findIndex((n) => n.id === activeId);

  const moveFocusTo = useCallback((id: string): void => {
    setActiveId(id);
    // Focus the treeitem element so the roving tabindex reads correctly to AT.
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>, node: FlatNode): void => {
      const idx = flat.findIndex((n) => n.id === node.id);
      if (idx === -1) return;
      switch (event.key) {
        case "ArrowDown":
          if (idx < flat.length - 1) { event.preventDefault(); moveFocusTo(flat[idx + 1].id); }
          break;
        case "ArrowUp":
          if (idx > 0) { event.preventDefault(); moveFocusTo(flat[idx - 1].id); }
          break;
        case "ArrowRight":
          // Closed parent → open it; open parent → move to first child.
          if (node.hasChildren) {
            event.preventDefault();
            if (!node.isOpen) toggle(node.id);
            else if (idx < flat.length - 1 && flat[idx + 1].parentId === node.id) moveFocusTo(flat[idx + 1].id);
          }
          break;
        case "ArrowLeft":
          // Open parent → collapse it; otherwise move to the parent node.
          event.preventDefault();
          if (node.hasChildren && node.isOpen) toggle(node.id);
          else if (node.parentId) moveFocusTo(node.parentId);
          break;
        case "Home":
          if (flat.length > 0) { event.preventDefault(); moveFocusTo(flat[0].id); }
          break;
        case "End":
          if (flat.length > 0) { event.preventDefault(); moveFocusTo(flat[flat.length - 1].id); }
          break;
        default:
          break;
      }
    },
    [flat, moveFocusTo, toggle],
  );

  if (categories.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay categorías.</p>;
  }

  // If the active node was removed/collapsed away, fall back to the first visible.
  const effectiveActiveId = activeIndex === -1 ? flat[0]?.id ?? null : activeId;

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label="Categorías"
      className="rounded-lg border border-border p-2"
      data-testid="category-tree"
    >
      {roots.map((node, index) => (
        <TreeItem
          key={node.category.id}
          node={node}
          depth={0}
          posInSet={index + 1}
          setSize={roots.length}
          expanded={expanded}
          activeId={effectiveActiveId}
          onKeyDown={onKeyDown}
          onFocusItem={setActiveId}
          onToggle={toggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node, depth, posInSet, setSize, expanded, activeId, onKeyDown, onFocusItem, onToggle, onEdit, onDelete,
}: {
  node: TreeNode;
  depth: number;
  posInSet: number;
  setSize: number;
  expanded: Set<string>;
  activeId: string | null;
  onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>, node: FlatNode) => void;
  onFocusItem: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (category: CategoryRow) => void;
  onDelete: (category: CategoryRow, hasChildren: boolean) => void;
}) {
  const { category, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(category.id);
  const isActive = activeId === category.id;
  const flatSelf: FlatNode = {
    id: category.id,
    depth,
    hasChildren,
    isOpen,
    parentId: category.parentId,
  };
  return (
    <li
      role="treeitem"
      // Selection follows focus in this single-select tree: the roving-active
      // (focused) node is the selected one (ARIA APG tree pattern).
      aria-selected={isActive}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-level={depth + 1}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      // Roving tabindex: only the active node is in the tab order; the rest are
      // reachable via arrow keys (ARIA APG tree pattern).
      tabIndex={isActive ? 0 : -1}
      data-node-id={category.id}
      data-testid={`category-node-${category.id}`}
      onKeyDown={(event) => onKeyDown(event, flatSelf)}
      onFocus={(event) => {
        // Only claim active when the focus is on the treeitem itself, not a
        // nested button (Editar/Eliminar/expand) bubbling up.
        if (event.target === event.currentTarget) onFocusItem(category.id);
      }}
      className="outline-none"
    >
      <div
        className={cn(
          "flex min-h-9 items-center gap-1 rounded-md px-1 hover:bg-muted/40",
          isActive && "ring-2 ring-ring/30",
        )}
        style={{ paddingLeft: `${Math.min(depth, 6) * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? "Contraer" : "Expandir"}
            tabIndex={-1}
            onClick={() => onToggle(category.id)}
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <HugeiconsIcon icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="inline-block w-6" />
        )}
        <span className={cn("flex-1 text-sm", !category.isActive && "text-muted-foreground")}>
          {category.name}
          {!category.isActive ? <Badge variant="outline" className="ml-2 text-[0.625rem]">Inactivo</Badge> : null}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onEdit(category)} data-testid={`category-edit-${category.id}`}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(category, hasChildren)} data-testid={`category-delete-${category.id}`}>Eliminar</Button>
      </div>
      {hasChildren && isOpen ? (
        <ul role="group" className="enter-fade">
          {children.map((child, index) => (
            <TreeItem
              key={child.category.id}
              node={child}
              depth={depth + 1}
              posInSet={index + 1}
              setSize={children.length}
              expanded={expanded}
              activeId={activeId}
              onKeyDown={onKeyDown}
              onFocusItem={onFocusItem}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Flatten the tree into visible (expanded) nodes in top-to-bottom order. */
function flattenVisible(roots: TreeNode[], expanded: Set<string>): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (node: TreeNode, depth: number): void => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.category.id);
    out.push({ id: node.category.id, depth, hasChildren, isOpen, parentId: node.category.parentId });
    if (hasChildren && isOpen) for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

/** Build the nested tree from flat category rows. */
function buildTree(categories: CategoryRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const category of categories) byId.set(category.id, { category, children: [] });
  const roots: TreeNode[] = [];
  for (const category of categories) {
    const node = byId.get(category.id);
    if (!node) continue;
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

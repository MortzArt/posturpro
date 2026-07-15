"use client";

import { useMemo, useState } from "react";
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

export function CategoryTree({ categories, onEdit, onDelete }: CategoryTreeProps) {
  const roots = useMemo(() => buildTree(categories), [categories]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (categories.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay categorías.</p>;
  }

  return (
    <ul role="tree" aria-label="Categorías" className="rounded-lg border border-border p-2" data-testid="category-tree">
      {roots.map((node, index) => (
        <TreeItem
          key={node.category.id}
          node={node}
          depth={0}
          posInSet={index + 1}
          setSize={roots.length}
          expanded={expanded}
          onToggle={toggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node, depth, posInSet, setSize, expanded, onToggle, onEdit, onDelete,
}: {
  node: TreeNode;
  depth: number;
  posInSet: number;
  setSize: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (category: CategoryRow) => void;
  onDelete: (category: CategoryRow, hasChildren: boolean) => void;
}) {
  const { category, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(category.id);
  return (
    <li
      role="treeitem"
      aria-selected={false}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-level={depth + 1}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      data-testid={`category-node-${category.id}`}
    >
      <div
        className="flex min-h-9 items-center gap-1 rounded-md px-1 hover:bg-muted/40"
        style={{ paddingLeft: `${Math.min(depth, 6) * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button type="button" aria-label={isOpen ? "Contraer" : "Expandir"} onClick={() => onToggle(category.id)} className="text-muted-foreground">
            <HugeiconsIcon icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="inline-block w-4" />
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

"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "@/lib/admin/taxonomy/taxonomy-read";

/**
 * CategoryMultiSelect (T11 Slice 2) — a checklist of the category tree (indented
 * by depth), selected shown as removable chips. Selected ids post as repeated
 * `category_ids` hidden inputs so the server action reads them via
 * `getAll("category_ids")`. Client component (local selection state).
 */
export function CategoryMultiSelect({
  options,
  defaultSelected,
  disabled,
}: {
  options: CategoryOption[];
  defaultSelected: string[];
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));
  const [open, setOpen] = useState(false);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chips = options.filter((option) => selected.has(option.value));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Categorías</span>
      {selected.size > 0 ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="admin-product-category-chips">
          {chips.map((chip) => (
            <li
              key={chip.value}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Quitar ${chip.label}`}
                onClick={() => toggle(chip.value)}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        data-testid="admin-product-category-toggle"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} aria-hidden />
        {open ? "Cerrar" : "Elegir categorías"}
      </button>

      {open ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay categorías. Créalas en Taxonomía.</p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
                style={{ paddingLeft: `${option.depth * 16 + 6}px` }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => toggle(option.value)}
                  className="size-4 accent-primary"
                  data-testid={`admin-product-category-${option.value}`}
                />
                {option.label}
              </label>
            ))
          )}
        </div>
      ) : null}

      {[...selected].map((id) => (
        <input key={id} type="hidden" name="category_ids" value={id} />
      ))}
    </div>
  );
}

/**
 * TagInput (T11 Slice 2) — free-text chips; type + Enter (or comma) adds a chip;
 * `×` removes. Existing tags autocomplete via a datalist. New tags are created
 * on save (slugified server-side). Posts as repeated `tag_names` hidden inputs.
 */
export function TagInput({
  defaultTags,
  suggestions,
  disabled,
}: {
  defaultTags: string[];
  suggestions: string[];
  disabled?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [draft, setDraft] = useState("");

  const add = (raw: string): void => {
    const value = raw.trim();
    if (value === "") return;
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    setTags((prev) => [...prev, value]);
    setDraft("");
  };

  const remove = (tag: string): void => {
    setTags((prev) => prev.filter((existing) => existing !== tag));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="admin-product-tag-input" className="text-sm font-medium">
        Etiquetas
      </label>
      <div className={cn("flex flex-wrap items-center gap-1.5 rounded-md border border-border p-2", disabled && "opacity-60")}>
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {tag}
            <button
              type="button"
              aria-label={`Quitar ${tag}`}
              onClick={() => remove(tag)}
              disabled={disabled}
              className="text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id="admin-product-tag-input"
          type="text"
          list="admin-product-tag-suggestions"
          value={draft}
          disabled={disabled}
          data-testid="admin-product-tag-input"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
            } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
          onBlur={() => add(draft)}
          placeholder="Escribe y Enter…"
          className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        />
        <datalist id="admin-product-tag-suggestions">
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      {tags.map((tag) => (
        <input key={tag} type="hidden" name="tag_names" value={tag} />
      ))}
    </div>
  );
}

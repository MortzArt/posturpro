"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextareaField, FieldError } from "@/components/admin/form/fields";
import { formatRelativeDate } from "@/lib/admin/format";
import { addInternalNote } from "@/app/admin/(app)/orders/actions";
import { INTERNAL_NOTE_MAX_LENGTH } from "@/lib/admin/orders/order-constants";
import type { AdminInternalNote } from "@/lib/admin/orders/order-read";

/**
 * InternalNotes (T12 Surface 6, AC-21) — private admin-only notes, stored in
 * `order_internal_notes` (never in status history, never emailed). Newest-first.
 * A `null` notes list (section read failed) renders a section-scoped banner while
 * the rest of the detail page still renders. Adding a note refreshes the page so
 * the new note is prepended.
 */
interface InternalNotesProps {
  orderId: string;
  notes: AdminInternalNote[] | null;
}

const ERROR_COPY: Record<string, string> = {
  empty: "Escribe una nota.",
  "too-long": `La nota no puede superar ${INTERNAL_NOTE_MAX_LENGTH} caracteres.`,
  "not-found": "No se encontró el pedido.",
  error: "No se pudo guardar la nota.",
};

export function InternalNotes({ orderId, notes }: InternalNotesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSave = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await addInternalNote(orderId, body);
      if (result.ok) {
        setBody("");
        setComposing(false);
        router.refresh();
        return;
      }
      setError(ERROR_COPY[result.reason] ?? ERROR_COPY.error);
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="internal-notes">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="font-normal text-muted-foreground">
          privada
        </Badge>
        {!composing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setComposing(true)}
            data-testid="internal-notes-add"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} aria-hidden />
            Agregar nota
          </Button>
        ) : null}
      </div>

      {composing ? (
        <div className="flex flex-col gap-2">
          <TextareaField
            name="note"
            label="Nueva nota"
            srOnlyLabel
            testid="internal-note-body"
            rows={3}
            maxLength={INTERNAL_NOTE_MAX_LENGTH}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={pending}
          />
          {error ? <FieldError id="note-error" testid="internal-note-error" message={error} /> : null}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onSave}
              disabled={pending || body.trim() === ""}
              data-testid="internal-note-save"
            >
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposing(false);
                setBody("");
                setError(null);
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {notes === null ? (
        <p role="alert" className="text-xs text-destructive" data-testid="internal-notes-error">
          No se pudieron cargar las notas.
        </p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin notas.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="internal-notes-list">
          {notes.map((note) => (
            <li key={note.id} className="text-sm">
              <p className="whitespace-pre-wrap break-words text-foreground">{note.body}</p>
              <p className="text-xs text-muted-foreground">{formatRelativeDate(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

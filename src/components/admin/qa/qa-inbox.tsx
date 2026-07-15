"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Message01Icon } from "@hugeicons/core-free-icons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextareaField, FieldError } from "@/components/admin/form/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  answerQuestionAction,
  setPublishedAction,
  deleteQuestionAction,
} from "@/app/admin/(app)/qa/actions";
import { formatRelativeDate } from "@/lib/admin/format";
import { QA_ANSWER_MAX_LENGTH } from "@/lib/config";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";
import type { AdminQuestion, QaFilter } from "@/lib/admin/qa/qa-read";

/**
 * QAInbox (T11 Slice 6, AC-28, edge 9) — answer/publish/unpublish/delete
 * questions. Segmented filter (sin responder / respondidas) via `?filter=`.
 * Answering sets answer+published+answered_at in one write and busts the PDP.
 */
export function QAInbox({
  questions,
  filter,
}: {
  questions: AdminQuestion[];
  filter: QaFilter;
}) {
  const router = useRouter();

  const changeFilter = (value: string): void => {
    router.replace(`/admin/qa?filter=${value}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={filter} onValueChange={changeFilter}>
        <TabsList>
          <TabsTrigger value="unanswered" data-testid="qa-tab-unanswered">Sin responder</TabsTrigger>
          <TabsTrigger value="answered" data-testid="qa-tab-answered">Respondidas</TabsTrigger>
        </TabsList>
      </Tabs>

      {questions.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="qa-list">
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: QaFilter }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center" data-testid="qa-empty">
      <HugeiconsIcon icon={Message01Icon} size={40} strokeWidth={2} aria-hidden className="text-muted-foreground/50" />
      <p className="text-sm">
        {filter === "unanswered" ? "No hay preguntas por responder." : "Aún no has respondido preguntas."}
      </p>
    </div>
  );
}

function QuestionCard({ question, onChanged }: { question: AdminQuestion; onChanged: () => void }) {
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isAnswered = question.answer !== null;

  const onPublish = (): void => {
    setError(null);
    const trimmed = answer.trim();
    if (trimmed.length === 0) { setError("Escribe una respuesta antes de publicar."); return; }
    if (trimmed.length > QA_ANSWER_MAX_LENGTH) { setError(`La respuesta no puede superar ${QA_ANSWER_MAX_LENGTH} caracteres.`); return; }
    startTransition(async () => {
      const result = await answerQuestionAction(question.id, trimmed);
      if (result.ok) onChanged();
      else setError("No se pudo publicar. Intenta de nuevo.");
    });
  };

  const onTogglePublish = (): void => {
    startTransition(async () => {
      const result = await setPublishedAction(question.id, !question.isPublished);
      if (result.ok) onChanged();
      else setError("No se pudo actualizar. Intenta de nuevo.");
    });
  };

  const onDelete = (): void => {
    setPendingDelete(false);
    startTransition(async () => {
      const result = await deleteQuestionAction(question.id);
      if (result.ok) onChanged();
      else setError("No se pudo eliminar. Intenta de nuevo.");
    });
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-4" data-testid={`qa-card-${question.id}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Link href={`${ADMIN_PRODUCTS_PATH}/${question.productId}/edit`} className="font-medium text-foreground hover:underline">
          {question.productName}
        </Link>
        <span className="flex items-center gap-2">
          {isAnswered && question.isPublished ? <Badge variant="secondary">Publicada</Badge> : null}
          {isAnswered && !question.isPublished ? <Badge variant="outline">Oculta</Badge> : null}
          {formatRelativeDate(question.createdAt)}
        </span>
      </div>
      <p className="text-sm">
        <span className="font-medium">{question.authorName}:</span> {question.question}
      </p>

      <TextareaField
        name="answer"
        label={`Respuesta a la pregunta de ${question.authorName}`}
        srOnlyLabel
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        maxLength={QA_ANSWER_MAX_LENGTH}
        rows={3}
        testid={`qa-answer-${question.id}`}
        error={error}
        disabled={pending}
      />
      <p className="text-right text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {answer.length} / {QA_ANSWER_MAX_LENGTH}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPendingDelete(true)} disabled={pending} data-testid={`qa-delete-${question.id}`}>
          Eliminar
        </Button>
        {isAnswered ? (
          <Button variant="secondary" size="sm" onClick={onTogglePublish} disabled={pending} data-testid={`qa-toggle-${question.id}`}>
            {question.isPublished ? "Ocultar" : "Publicar"}
          </Button>
        ) : null}
        <Button size="sm" onClick={onPublish} disabled={pending} data-testid={`qa-publish-${question.id}`}>
          {pending ? "Publicando…" : isAnswered ? "Actualizar respuesta" : "Publicar respuesta"}
        </Button>
      </div>

      {error && !answer ? (
        <FieldError id={`qa-error-${question.id}`} message={error} testid={`qa-error-${question.id}`} />
      ) : null}

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent className="dialog-content-motion">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pregunta?</AlertDialogTitle>
            <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} data-testid={`qa-delete-confirm-${question.id}`}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

import { HugeiconsIcon } from "@hugeicons/react";
import { MessageQuestionIcon } from "@hugeicons/core-free-icons";
import { QaForm, type QaFormLabels } from "@/components/product/qa-form";
import type { ProductQuestionView } from "@/lib/catalog/product-detail.types";

/**
 * ProductQa (T4 AC-13/14/15) — server component. Lists PUBLISHED questions
 * (newest-first) and renders the client `QaForm`. When there are none, a
 * friendly empty state renders with the form directly below as the CTA.
 *
 * Rendering safety: author / question / answer are TEXT NODES only — never
 * `dangerouslySetInnerHTML` (React auto-escapes; XSS surface nil). Answer
 * timestamps are intentionally hidden in Phase 1 (design Open Question #4).
 */

interface ProductQaProps {
  productId: string;
  slug: string;
  questions: ProductQuestionView[];
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  answerPrefix: string;
  maxName: number;
  maxQuestion: number;
  formLabels: QaFormLabels;
}

export function ProductQa({
  productId,
  slug,
  questions,
  heading,
  emptyTitle,
  emptyBody,
  answerPrefix,
  maxName,
  maxQuestion,
  formLabels,
}: ProductQaProps) {
  const hasQuestions = questions.length > 0;

  return (
    <section className="mt-10 md:mt-12" data-testid="product-qa">
      <h2 className="mb-4 text-sm font-medium tracking-tight text-foreground">
        {heading}
      </h2>

      <div className="max-w-2xl">
        {hasQuestions ? (
          <ul data-testid="qa-list">
            {questions.map((item) => (
              <QaItem key={item.id} item={item} answerPrefix={answerPrefix} />
            ))}
          </ul>
        ) : (
          <QaEmptyState title={emptyTitle} body={emptyBody} />
        )}

        <QaForm
          productId={productId}
          slug={slug}
          maxName={maxName}
          maxQuestion={maxQuestion}
          labels={formLabels}
        />
      </div>
    </section>
  );
}

function QaItem({
  item,
  answerPrefix,
}: {
  item: ProductQuestionView;
  answerPrefix: string;
}) {
  return (
    <li
      className="border-b border-border py-4"
      data-testid={`qa-item-${item.id}`}
    >
      <p className="text-sm font-medium break-words text-foreground">
        {item.question}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{item.authorName}</p>
      {item.answer ? (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm/relaxed break-words text-foreground">
          <span className="sr-only">{answerPrefix}: </span>
          {item.answer}
        </div>
      ) : null}
    </li>
  );
}

function QaEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="enter-fade flex flex-col items-center gap-2 py-8 text-center"
      data-testid="qa-empty"
    >
      <HugeiconsIcon
        icon={MessageQuestionIcon}
        size={40}
        strokeWidth={1.5}
        aria-hidden
        className="text-muted-foreground"
      />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

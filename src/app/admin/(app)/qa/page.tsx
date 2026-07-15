import { AdminPage } from "@/components/admin/admin-page";
import { QAInbox } from "@/components/admin/qa/qa-inbox";
import {
  listAdminQuestions,
  countUnansweredQuestions,
  type QaFilter,
} from "@/lib/admin/qa/qa-read";

/**
 * Q&A inbox page (T11 Slice 6). Server component: reads the questions for the
 * active segment (unanswered-first by default) + the unanswered count for the
 * header. Hands off to the client inbox for answering/publishing/deleting.
 */
export const dynamic = "force-dynamic";

export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const active: QaFilter = filter === "answered" ? "answered" : "unanswered";

  const [questions, unanswered] = await Promise.all([
    listAdminQuestions(active),
    countUnansweredQuestions(),
  ]);

  const description =
    unanswered === 0
      ? "No hay preguntas por responder."
      : `${unanswered} sin responder`;

  return (
    <AdminPage title="Preguntas" description={description}>
      <QAInbox questions={questions} filter={active} />
    </AdminPage>
  );
}

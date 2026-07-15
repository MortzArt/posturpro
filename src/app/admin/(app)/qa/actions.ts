"use server";

/**
 * Q&A server actions (T11 Slice 6). Re-verify the session, then delegate to the
 * qa write layer. Return serializable results the inbox renders.
 */
import { requireSession } from "@/lib/admin/require-session";
import {
  answerQuestion,
  setQuestionPublished,
  deleteQuestion,
  type QaWriteResult,
} from "@/lib/admin/qa/qa-write";

/** Answer + publish a question. */
export async function answerQuestionAction(
  questionId: string,
  answer: string,
): Promise<QaWriteResult> {
  await requireSession();
  return answerQuestion(questionId, answer);
}

/** Publish / unpublish a question. */
export async function setPublishedAction(
  questionId: string,
  isPublished: boolean,
): Promise<QaWriteResult> {
  await requireSession();
  return setQuestionPublished(questionId, isPublished);
}

/** Delete a spam question. */
export async function deleteQuestionAction(questionId: string): Promise<QaWriteResult> {
  await requireSession();
  return deleteQuestion(questionId);
}

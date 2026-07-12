/**
 * Product Q&A anon INSERT policy (AC-12, M-6) against a live local Supabase.
 *
 * The single public write surface: anon may insert an UNPUBLISHED, UNANSWERED
 * question on an ACTIVE product, with bounded free-text. It may NOT self-publish
 * or self-answer, and may only read published questions. Cleanup via service.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

const anon = anonClient();
const service = serviceClient();

let activeProductId = "";
const createdQuestionIds: string[] = [];
// Marker embedded in every question this suite writes, so cleanup can find the
// anon-inserted (unpublished, unreadable-by-anon) rows via the service client.
const MARKER = `qa-int-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  const { data, error } = await service
    .from("products")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .single();
  expect(error).toBeNull();
  activeProductId = data?.id ?? "";
  expect(activeProductId).not.toBe("");
});

afterAll(async () => {
  // Delete every row this suite created (published ones by id, plus any
  // anon-inserted unpublished rows found via the embedded marker).
  if (createdQuestionIds.length > 0) {
    await service
      .from("product_questions")
      .delete()
      .in("id", createdQuestionIds.splice(0));
  }
  await service.from("product_questions").delete().like("question", `%${MARKER}%`);
});

describe("anon question INSERT policy (AC-12)", () => {
  it("allows a valid unpublished question on an active product", async () => {
    // A real storefront submits with return=minimal: the anon SELECT policy
    // hides unpublished rows, so requesting the row back would (correctly) be
    // denied. We assert the INSERT itself succeeds.
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Curioso",
      question: `¿Esta silla soporta 120 kg? ${MARKER}`,
      is_published: false,
      answer: null,
      answered_at: null,
    } as never);
    expect(error).toBeNull();
  });

  it("rejects an attempt to self-publish (is_published = true)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Tramposo",
      question: "Pregunta auto-publicada",
      is_published: true,
      answer: null,
      answered_at: null,
    } as never);
    expect(error).not.toBeNull();
  });

  it("rejects an attempt to self-answer (answer not null)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Tramposo",
      question: "Pregunta con respuesta inyectada",
      is_published: false,
      answer: "respuesta falsa",
      answered_at: null,
    } as never);
    expect(error).not.toBeNull();
  });

  it("rejects an over-length question (> 2000 chars, M-6)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Spammer",
      question: "x".repeat(2_001),
      is_published: false,
      answer: null,
      answered_at: null,
    } as never);
    expect(error).not.toBeNull();
  });

  it("rejects a blank author name", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "",
      question: "Pregunta válida",
      is_published: false,
      answer: null,
      answered_at: null,
    } as never);
    expect(error).not.toBeNull();
  });
});

describe("anon question SELECT policy (AC-12)", () => {
  it("cannot read an unpublished question it just inserted", async () => {
    const { data } = await anon
      .from("product_questions")
      .select("id, is_published");
    // Only published questions are visible; the unpublished insert above is hidden.
    for (const row of data ?? []) {
      expect(row.is_published).toBe(true);
    }
  });

  it("CAN read a question once the server publishes it", async () => {
    const inserted = await service
      .from("product_questions")
      .insert({
        product_id: activeProductId,
        author_name: "Publicado",
        question: "¿Incluye garantía?",
        is_published: true,
        answer: "Sí, 2 años.",
        answered_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (inserted.data?.id) createdQuestionIds.push(inserted.data.id);

    const { data, error } = await anon
      .from("product_questions")
      .select("id, is_published")
      .eq("id", inserted.data?.id ?? "");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0]?.is_published).toBe(true);
  });
});

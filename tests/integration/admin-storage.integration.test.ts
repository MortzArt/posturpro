/**
 * T11 storage smoke integration (AC-2/14/16) against a LIVE local Supabase with
 * `[storage]` enabled. Proves the full round-trip: upload to the public
 * `product-images` bucket → fetch the public URL over HTTP → delete the object.
 * This is the real proof that re-enabling storage works end-to-end.
 */
import { describe, expect, it } from "vitest";
import { serviceClient } from "./local-supabase";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/config";

const db = serviceClient();

// A 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("product-images storage round-trip (live local DB)", () => {
  it("uploads, serves the public URL, and deletes", async () => {
    const path = `integration-test/${Date.now()}.png`;
    const bytes = Buffer.from(PNG_BASE64, "base64");

    const upload = await db.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    expect(upload.error).toBeNull();

    const { data: publicData } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
    expect(publicData.publicUrl).toContain(`/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`);

    const response = await fetch(publicData.publicUrl);
    expect(response.status).toBe(200);
    const fetched = Buffer.from(await response.arrayBuffer());
    expect(fetched.length).toBe(bytes.length);

    const remove = await db.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
    expect(remove.error).toBeNull();

    // After delete the public URL 404s.
    const after = await fetch(publicData.publicUrl);
    expect(after.status).toBe(400);
  });

  it("the public bucket exists and is public", async () => {
    const { data, error } = await db.storage.getBucket(PRODUCT_IMAGES_BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(true);
  });
});

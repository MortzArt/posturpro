/**
 * <DirectionContract> tests (T15 AC-2). The committed 5-block direction contract
 * must reach the emitted storefront markup as a REAL HTML comment (JSX `{/* *​/}`
 * comments are stripped by the compiler and never reach the DOM), so it survives
 * the production build and is greppable in the built output (`d43cafe8`). It must
 * also carry zero visual/layout/a11y footprint. We assert:
 *   - a real HTML comment node is emitted (nodeType === COMMENT_NODE).
 *   - the comment payload contains the seed key + all five contract blocks +
 *     the FINISH line (the exact tokens a build-output grep looks for).
 *   - the wrapper is `hidden` + `aria-hidden` (zero footprint).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { DirectionContract } from "./direction-contract";

afterEach(cleanup);

function findCommentNode(root: Node): Comment | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  return walker.nextNode() as Comment | null;
}

describe("DirectionContract — AC-2 emitted HTML comment", () => {
  it("emits a real HTML comment node (not a stripped JSX comment)", () => {
    const { container } = render(<DirectionContract />);
    const comment = findCommentNode(container);
    expect(comment).not.toBeNull();
    expect(comment?.nodeType).toBe(Node.COMMENT_NODE);
  });

  it("carries the seed key and every contract block in the payload", () => {
    const { container } = render(<DirectionContract />);
    const payload = findCommentNode(container)?.textContent ?? "";

    expect(payload).toContain("impeccable:direction-contract");
    expect(payload).toContain("seed=d43cafe8");
    for (const block of [
      "THESIS:",
      "OWN-WORLD:",
      "STORY:",
      "FIRST VIEWPORT:",
      "FORM:",
      "FINISH:",
    ]) {
      expect(payload).toContain(block);
    }
  });

  it("wraps the comment in a hidden, aria-hidden, zero-footprint element", () => {
    const { container } = render(<DirectionContract />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hasAttribute("hidden")).toBe(true);
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  });
});

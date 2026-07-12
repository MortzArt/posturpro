import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("resolves conflicting tailwind classes to the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("drops falsy conditional classes", () => {
    expect(cn("base", false && "hidden", undefined, null)).toBe("base")
  })
})

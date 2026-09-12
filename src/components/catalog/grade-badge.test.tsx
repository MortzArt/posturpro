import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GradeBadge } from "@/components/catalog/grade-badge";

describe("GradeBadge (T19 AC-10/11, edges 1/2)", () => {
  it("renders the label + a grade data attribute when a valid grade is set", () => {
    render(<GradeBadge grade="A+" label="Grado A+" />);
    const badge = screen.getByTestId("grade-badge");
    expect(badge).toHaveTextContent("Grado A+");
    expect(badge).toHaveAttribute("data-grade", "A+");
  });

  it.each(["A+", "A", "B"] as const)("renders each valid grade %s", (grade) => {
    render(<GradeBadge grade={grade} label={`Grade ${grade}`} />);
    expect(screen.getByTestId("grade-badge")).toHaveAttribute("data-grade", grade);
  });

  it("renders NOTHING (no badge, no empty space) when grade is null (edge 1)", () => {
    const { container } = render(<GradeBadge grade={null} label="Grado A+" />);
    expect(screen.queryByTestId("grade-badge")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when grade is undefined", () => {
    render(<GradeBadge grade={undefined} label="Grado A+" />);
    expect(screen.queryByTestId("grade-badge")).toBeNull();
  });

  it("renders nothing for an unrecognized grade value rather than throwing (edge 2)", () => {
    // A legacy/tampered value that reaches the badge must not crash the page.
    render(
      <GradeBadge
        grade={"C" as unknown as "A+"}
        label="Grado C"
      />,
    );
    expect(screen.queryByTestId("grade-badge")).toBeNull();
  });

  it("uses token classes (no hardcoded hex) — mint chip + border", () => {
    render(<GradeBadge grade="A" label="Grado A" />);
    const badge = screen.getByTestId("grade-badge");
    expect(badge.className).toContain("bg-secondary");
    expect(badge.className).toContain("text-secondary-foreground");
    expect(badge.className).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("defaults to the compact card chip and offers a roomier `lg` size for the PDP card", () => {
    render(<GradeBadge grade="A+" label="Grado A+" />);
    const compact = screen.getByTestId("grade-badge");
    expect(compact.dataset.size).toBe("sm");
    expect(compact.className).toContain("text-xs");
    expect(compact.className).toContain("whitespace-nowrap");
    expect(compact.className).not.toContain("truncate");

    cleanup();
    render(<GradeBadge grade="A+" label="Grado A+" size="lg" />);
    const roomy = screen.getByTestId("grade-badge");
    expect(roomy.dataset.size).toBe("lg");
    expect(roomy.className).toContain("text-sm");
  });
});

/**
 * <Button> variant-grammar guard (T20 AC-10, firewall).
 *
 * T20 gave the storefront its Factorial pill grammar via the `cta` and `xl`
 * Button variants WITHOUT changing the shared admin buttons. These are
 * behavioral class pins (not snapshots): they assert the exact grammar the
 * restyle promised — `cta`/`xl` render as full-radius pills, `cta` carries the
 * 2px self-colored border, hover is a COLOR swap only (`transition-colors`, no
 * `transition-all`, no scale/lift), and the admin-shared variants/sizes keep
 * `rounded-md`. If a future edit rebinds admin radius or drops the pill, this
 * fails — the firewall the whole ticket hinges on.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Button } from "./button";

afterEach(cleanup);

describe("Button — Factorial pill grammar (AC-10)", () => {
  it("the cta variant is a full-radius pill with a 2px self-colored border", () => {
    render(<Button variant="cta">Ver catálogo</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("border-2");
    expect(cls).toContain("border-cta");
    expect(cls).toContain("bg-cta");
    // Dark warm-brown foreground (AA 5.30:1) — never white-on-orange (AC-20).
    expect(cls).toContain("text-cta-foreground");
  });

  it("the xl size is a full-radius pill (so outline secondaries are pills too)", () => {
    render(
      <Button variant="outline" size="xl">
        ¿Cómo funciona?
      </Button>,
    );
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-full");
    // Factorial large pill is ≥44px tap target (h-12 = 48px).
    expect(cls).toContain("h-12");
  });

  it("hover is a color swap only — transition-colors, never transition-all", () => {
    render(<Button variant="cta">CTA</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("transition-colors");
    expect(cls).not.toContain("transition-all");
    // No hover scale/lift (Factorial CTAs are flat); press feedback only.
    expect(cls).not.toMatch(/hover:scale-/);
    expect(cls).not.toMatch(/hover:-translate-y/);
  });
});

describe("Button — admin firewall: shared variants keep rounded-md (AC-6/AC-10)", () => {
  it("the default (admin) variant stays rounded-md, never a pill", () => {
    render(<Button>Guardar</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-md");
    expect(cls).not.toContain("rounded-full");
  });

  it("the outline variant at default size stays rounded-md, never a pill", () => {
    render(<Button variant="outline">Cancelar</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-md");
    expect(cls).not.toContain("rounded-full");
  });

  it("a default-size admin button keeps the compact height (not the h-12 pill)", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button").className).not.toContain("h-12");
  });
});

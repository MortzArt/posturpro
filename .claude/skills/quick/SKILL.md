---
name: quick
description: "Run the minimal 3-stage pipeline loop: Dev → Review → Fix. Use when the ticket already exists and you want a fast build-review-fix cycle without full audits."
---

# Quick Pipeline (Dev → Review → Fix)

Run a minimal 3-stage loop for fast iteration.

## When to Use

- The planning ticket (`tasks/next-ticket.md`) already exists
- You want fast implementation without full QA/UX/security audits
- Iterating on existing code that doesn't need architectural review

## Steps

1. **Verify prerequisites**:
   - `tasks/next-ticket.md` must exist — if not, run `/plan` first
   - Read `tasks/pipeline-state.md` for context

2. **Run Stage 4 (Dev)**: Launch the ultradev agent
   ```
   Task(
     subagent_type="ultradev",
     prompt="Quick pipeline — Stage 4 (Dev).
   Read tasks/next-ticket.md. Implement the feature completely.
   Write summary to tasks/dev-done.md."
   )
   ```
   - Git commit after completion

3. **Run Stage 5 (Review)**: Launch the ultrareview agent
   ```
   Task(
     subagent_type="ultrareview",
     prompt="Quick pipeline — Stage 5 (Review).
   Read tasks/next-ticket.md and tasks/dev-done.md.
   Review all changed files. Write findings to tasks/review-findings.md."
   )
   ```
   - Git commit after completion

4. **Run Stage 6 (Fix)**: Launch the ultrafix agent
   ```
   Task(
     subagent_type="ultrafix",
     prompt="Quick pipeline — Stage 6 (Fix).
   Read tasks/review-findings.md. Fix all critical and major issues.
   Run tests. Update tasks/dev-done.md."
   )
   ```
   - Git commit after completion

5. **Report** summary: what was built, review score, fixes applied, test results.

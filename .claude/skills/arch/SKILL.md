---
name: arch
description: "Run only the architecture review stage (Stage 10). Launches the ultraarch agent to evaluate patterns, data models, API design, scalability, and tech debt."
---

# Architecture Stage (Stage 10)

Run the ultraarch agent for architecture review.

## Steps

1. **Read inputs**:
   - Read `tasks/dev-done.md` for what was implemented
   - Read `PRODUCT_SPEC.md` for product roadmap context
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultraarch agent** via the Task tool:
   ```
   Task(
     subagent_type="ultraarch",
     prompt="You are running Stage 10 (Arch) of the pipeline.

   Read tasks/dev-done.md for the implementation summary.
   Read PRODUCT_SPEC.md for product vision and roadmap.
   Evaluate the implementation against established codebase patterns (see CLAUDE.md).
   Check: pattern compliance, data model, API design, scalability, tech debt.
   Refactor if needed. Run tests after changes.
   Write your review to tasks/architecture-review.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/architecture-review.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 10 (ultraarch): architecture review for [task name]"`

4. **Report** the architecture score and key concerns to the user.

---
name: ui-design
description: "Run only the UI design stage (Stage 3). Launches the ultradesign agent to create component designs, interaction patterns, wireframes, and visual specifications."
---

# UI Design Stage (Stage 3)

Run the ultradesign agent for UI/UX design specifications.

## Steps

1. **Read inputs**:
   - Read `tasks/next-ticket.md` for UX requirements
   - Read `tasks/research-report.md` for codebase context
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultradesign agent** via the Task tool:
   ```
   Task(
     subagent_type="ultradesign",
     prompt="You are running Stage 3 (UI Design) of the pipeline.

   Read tasks/next-ticket.md for the implementation ticket and UX requirements.
   Read tasks/research-report.md for codebase patterns and existing components.
   Design all UI components for this feature.
   Write your design spec to tasks/ui-design.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/ui-design.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 3 (ultradesign): UI design for [task name]"`

4. **Report** the design summary to the user.

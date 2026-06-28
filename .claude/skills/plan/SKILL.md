---
name: plan
description: "Run only the planning stage (Stage 1). Launches the ultraplanner agent to create a detailed implementation ticket with acceptance criteria, edge cases, and UX requirements."
---

# Plan Stage (Stage 1)

Run the ultraplanner agent to create a comprehensive implementation ticket.

## Steps

1. **Read state files**:
   - Read `BUILD_PLAN.md` to find the current/next task
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultraplanner agent** via the Task tool:
   ```
   Task(
     subagent_type="ultraplanner",
     prompt="You are running Stage 1 (Plan) of the pipeline.

   Task: [task description from BUILD_PLAN.md or user request]

   Read PRODUCT_SPEC.md and BUILD_PLAN.md for full context.
   Read the existing codebase to understand what's built.
   Write a comprehensive implementation ticket to tasks/next-ticket.md.

   Follow all instructions in your agent prompt. Every section must be complete."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/next-ticket.md` was written
   - Update `tasks/pipeline-state.md`:
     ```
     Stage: 1
     Agent: ultraplanner
     Status: COMPLETE
     ```
   - Git commit: `git add -A && git commit -m "stage 1 (ultraplanner): planning ticket for [task name]"`

4. **Report** the ticket summary to the user.

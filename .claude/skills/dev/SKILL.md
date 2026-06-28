---
name: dev
description: "Run only the development stage (Stage 4). Launches the ultradev agent to implement the feature production-ready with zero TODOs."
---

# Dev Stage (Stage 4)

Run the ultradev agent for full feature implementation.

## Steps

1. **Read inputs**:
   - Read `tasks/next-ticket.md` for acceptance criteria
   - Read `tasks/research-report.md` for codebase patterns
   - Read `tasks/ui-design.md` for component designs
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultradev agent** via the Task tool:
   ```
   Task(
     subagent_type="ultradev",
     prompt="You are running Stage 4 (Dev) of the pipeline.

   Read tasks/next-ticket.md for the full implementation ticket.
   Read tasks/research-report.md for codebase analysis and patterns.
   Read tasks/ui-design.md for UI component designs.
   Implement the feature COMPLETELY — production-ready, zero TODOs.
   Write your summary to tasks/dev-done.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/dev-done.md` was written and code changes were made
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 4 (ultradev): implement [task name]"`

4. **Report** the implementation summary to the user.

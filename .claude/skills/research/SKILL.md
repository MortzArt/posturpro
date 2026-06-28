---
name: research
description: "Run only the research stage (Stage 2). Launches the ultraresearch agent to deep-dive into the codebase, discover patterns, analyze dependencies, and produce a research report."
---

# Research Stage (Stage 2)

Run the ultraresearch agent for comprehensive codebase and dependency analysis.

## Steps

1. **Read inputs**:
   - Read `tasks/next-ticket.md` for the implementation ticket
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultraresearch agent** via the Task tool:
   ```
   Task(
     subagent_type="ultraresearch",
     prompt="You are running Stage 2 (Research) of the pipeline.

   Read tasks/next-ticket.md for the implementation ticket.
   Deep-dive into the codebase to find all relevant files, patterns, and dependencies.
   Write your research report to tasks/research-report.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/research-report.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 2 (ultraresearch): research report for [task name]"`

4. **Report** key findings to the user.

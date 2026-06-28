---
name: hacker
description: "Run only the hacker/bug-hunter stage (Stage 11). Launches the ultrahacker agent to find dead UI, visual bugs, logic bugs, race conditions, and suggest product improvements."
---

# Hacker Stage (Stage 11)

Run the ultrahacker agent for chaos testing and bug hunting.

## Steps

1. **Read inputs**:
   - Read `tasks/dev-done.md` for what was implemented
   - Read `tasks/next-ticket.md` for feature context
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultrahacker agent** via the Task tool:
   ```
   Task(
     subagent_type="ultrahacker",
     prompt="You are running Stage 11 (Hacker) of the pipeline.

   Read tasks/dev-done.md for what was implemented and which files changed.
   Read tasks/next-ticket.md for the feature requirements.
   Hunt for: dead UI, visual bugs, logic bugs, race conditions, missing states.
   Test at 375px and 1024px viewports.
   FIX what you find — don't just report.
   Suggest product improvements.
   Run tests after fixes.
   Write your report to tasks/hacker-report.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/hacker-report.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 11 (ultrahacker): chaos testing for [task name]"`

4. **Report** the chaos score and bugs found/fixed to the user.

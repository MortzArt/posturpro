---
name: qa
description: "Run only the QA stage (Stage 7). Launches the ultraqa agent for comprehensive test coverage — unit, integration, e2e tests. Hunts untested code across the codebase."
---

# QA Stage (Stage 7)

Run the ultraqa agent for comprehensive test coverage.

## Steps

1. **Read inputs**:
   - Read `tasks/next-ticket.md` for acceptance criteria and edge cases
   - Read `tasks/dev-done.md` for what was implemented
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultraqa agent** via the Task tool:
   ```
   Task(
     subagent_type="ultraqa",
     prompt="You are running Stage 7 (QA) of the pipeline.

   Read tasks/next-ticket.md for acceptance criteria and edge cases.
   Read tasks/dev-done.md for what was implemented and how.
   Write comprehensive tests: unit, integration, e2e.
   Every acceptance criterion must have at least one test.
   Every edge case must have a test.
   Run ALL tests and fix any failures.
   Write your report to tasks/qa-report.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/qa-report.md` was written and tests were created
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 7 (ultraqa): QA tests for [task name]"`

4. **Report** the test results (total/passed/failed, confidence level) to the user.

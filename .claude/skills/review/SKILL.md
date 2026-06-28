---
name: review
description: "Run only the code review stage (Stage 5). Launches the ultrareview agent for adversarial, line-by-line code review of all changed files."
---

# Review Stage (Stage 5)

Run the ultrareview agent for comprehensive code review.

## Steps

1. **Read inputs**:
   - Read `tasks/next-ticket.md` for acceptance criteria
   - Read `tasks/dev-done.md` for list of changed files
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultrareview agent** via the Task tool:
   ```
   Task(
     subagent_type="ultrareview",
     prompt="You are running Stage 5 (Review) of the pipeline.

   Read tasks/next-ticket.md for the implementation ticket with acceptance criteria.
   Read tasks/dev-done.md for the developer's summary of changes.
   Review EVERY changed file line-by-line.
   Write your review to tasks/review-findings.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/review-findings.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 5 (ultrareview): code review for [task name]"`

4. **Report** the review findings summary (critical/major issue counts, recommendation) to the user.

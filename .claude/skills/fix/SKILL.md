---
name: fix
description: "Run only the fix stage (Stage 6). Launches the ultrafix agent to systematically fix all critical and major issues from code review."
---

# Fix Stage (Stage 6)

Run the ultrafix agent to resolve all review findings.

## Steps

1. **Read inputs**:
   - Read `tasks/review-findings.md` for all issues to fix
   - Read `tasks/next-ticket.md` for original requirements context
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultrafix agent** via the Task tool:
   ```
   Task(
     subagent_type="ultrafix",
     prompt="You are running Stage 6 (Fix) of the pipeline.

   Read tasks/review-findings.md for all issues found in code review.
   Read tasks/next-ticket.md for the original ticket context.
   Fix EVERY critical issue. Fix EVERY major issue. Fix minor issues where reasonable.
   Update tasks/dev-done.md with the fixes applied.
   Run the test suite after all fixes.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify fixes were applied and `tasks/dev-done.md` was updated
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 6 (ultrafix): fix review findings for [task name]"`

4. **Report** the fix summary (critical/major/minor fixed, tests status) to the user.

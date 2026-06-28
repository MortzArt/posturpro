---
name: verify
description: "Run only the final verification gate (Stage 12). Launches the ultraverify agent to run all tests, check every acceptance criterion, and deliver a SHIP/NO-SHIP verdict."
---

# Verify Stage (Stage 12)

Run the ultraverify agent for the final ship/no-ship decision.

## Steps

1. **Read inputs**:
   - All task artifact files (next-ticket.md through hacker-report.md)
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultraverify agent** via the Task tool:
   ```
   Task(
     subagent_type="ultraverify",
     prompt="You are running Stage 12 (Verify) of the pipeline — the final gate.

   Read ALL task artifacts:
   - tasks/next-ticket.md (original ticket)
   - tasks/dev-done.md (implementation summary)
   - tasks/review-findings.md (code review)
   - tasks/qa-report.md (test results)
   - tasks/ux-audit.md (UX audit)
   - tasks/security-audit.md (security audit)
   - tasks/architecture-review.md (architecture review)
   - tasks/hacker-report.md (chaos testing)

   Run the COMPLETE test suite. Every test must pass.
   Verify every acceptance criterion by reading actual code.
   Check all reports for unresolved issues.
   Write your verdict to tasks/ship-decision.md.

   SHIP criteria: all tests pass, quality >= 8/10, no critical issues, no security vulnerabilities.
   NO-SHIP criteria: any test failing, quality < 8/10, critical issues open, security vulnerability.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Read `tasks/ship-decision.md` for the verdict
   - Update `tasks/pipeline-state.md`
   - If **SHIP**: Mark task `[x]` in BUILD_PLAN.md, set pipeline-state to COMPLETE
   - If **NO-SHIP**: Set pipeline-state to stage 4 for re-iteration
   - Git commit: `git add -A && git commit -m "stage 12 (ultraverify): [SHIP/NO-SHIP] for [task name]"`

4. **Report** the verdict, quality score, and summary to the user.

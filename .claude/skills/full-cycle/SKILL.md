---
name: full-cycle
description: "Run the full autonomous pipeline end-to-end. Identifies the next task (or creates one in Continuous Improvement Mode), then auto-classifies complexity: low → standard flow, medium → skip hacker, high → all 12 stages."
---

# Full Cycle Pipeline

Run the autonomous pipeline for the current or next task. Auto-classifies complexity after planning to determine pipeline depth.

## Steps

1. **Read state files**:
   - Read `BUILD_PLAN.md` to find the first `[ ]` task
   - Read `tasks/pipeline-state.md` to check for interrupted sessions
   - If pipeline-state shows an in-progress task, resume from the saved stage

2. **If no pending tasks** (all are `[x]`), enter **Continuous Improvement Mode**:
   - Read `PRODUCT_SPEC.md` and analyze the codebase
   - Identify the highest-impact improvement (unbuilt features, tech debt, missing tests, UX issues, performance)
   - Append a new `[ ]` task to `BUILD_PLAN.md`

3. **Initialize pipeline state**:
   ```
   # Pipeline State
   Task: [task name]
   Tier: full-cycle
   Stage: 1
   Agent: ultraplanner-research
   Last Updated: [now]
   Notes: Starting full cycle
   ```

3b. **Stage 1+2 — Combined PlanResearch**: Launch `ultraplanner-research` agent (replaces separate planner + researcher):

```
Task(
  subagent_type="ultraplanner-research",
  prompt="Full-cycle pipeline — Stage 1+2 (PlanResearch).
Read BUILD_PLAN.md for the task: [task description].
Read PRODUCT_SPEC.md for product context.
Scan the codebase once. Produce BOTH:
1. tasks/next-ticket.md (with Complexity classification)
2. tasks/research-report.md
One codebase scan, two outputs."
)
```

- Git commit after completion

3c. **Auto-Classification** — Read `## Complexity` from `tasks/next-ticket.md`:

- **`low`** → Switch to standard flow. Update pipeline-state `Tier: standard`. Run remaining standard stages (S2-S5): UI Design → Dev → ReviewFix → QA. Then mark complete. No verify gate.
- **`medium`** → Continue full pipeline but **skip Stage 11 (Hacker)**. Update pipeline-state `Tier: full-cycle (medium)`.
- **`high`** → Full 12 stages. Update pipeline-state `Tier: full-cycle (high)`.

3d. **Read Feature Type** from `tasks/next-ticket.md`:

- `frontend-only` → Run Security (9) and Arch (10) as lightweight reviews. Skip backend-heavy checks.
- `backend-only` → Skip UI Design (3) and UX (8). Run other stages at full depth.
- `full-stack` → All stages at full depth (default).

4. **Run stages in order** (for medium/high complexity), using the Task tool to launch each agent:

   | Block | Stage | Agent                 | Prompt includes                                                    | Notes                               |
   | ----- | ----- | --------------------- | ------------------------------------------------------------------ | ----------------------------------- |
   | A     | 1+2   | ultraplanner-research | Task description, PRODUCT_SPEC.md context                          | Combined plan+research (done in 3b) |
   | A     | 3     | ultradesign           | tasks/next-ticket.md, tasks/research-report.md                     | Skip if backend-only                |
   | B     | 4     | ultradev              | tasks/next-ticket.md, tasks/research-report.md, tasks/ui-design.md |                                     |
   | B     | 5     | ultrareview           | tasks/next-ticket.md, tasks/dev-done.md, changed files             |                                     |
   | B     | 6     | ultrafix              | tasks/review-findings.md                                           |                                     |
   | C     | 7     | ultraqa               | tasks/next-ticket.md, tasks/dev-done.md                            | Runs BEFORE UX                      |
   | C     | 8     | ultraux               | tasks/next-ticket.md, tasks/ui-design.md, tasks/qa-report.md       | Skip if backend-only                |
   | D     | 9     | ultrasecurity         | tasks/dev-done.md, changed files                                   | **Parallel with 10**                |
   | D     | 10    | ultraarch             | tasks/dev-done.md, PRODUCT_SPEC.md                                 | **Parallel with 9**                 |
   | E     | 11    | ultrahacker           | tasks/dev-done.md, all UI files                                    | **Skip if medium complexity**       |
   | E     | 12    | ultraverify           | All task artifacts, full test suite                                |                                     |

   **Parallel execution (Block D)**: Launch Stages 9 and 10 as two Task tool calls in the SAME message. Wait for both to complete, then git commit both results together.

   **Note**: Review+Fix (stages 5+6) stay SEPARATE for medium/high complexity — better audit trail for complex tasks.

5. **After each stage** (or block):
   - Update `tasks/pipeline-state.md` with next stage
   - Git commit: `git add -A && git commit -m "stage N (<agent>): <description>"`
   - Check context — if running low, save state and STOP

6. **After Stage 12**:
   - **If SHIP** → mark task `[x]` in BUILD_PLAN.md, set pipeline-state to COMPLETE
   - **If NO-SHIP** → use **Smart NO-SHIP Loop**:
     1. Read `tasks/ship-decision.md` for the `## NO-SHIP Analysis` section
     2. Extract the `Root Cause` and `Run Stages` fields
     3. Run ONLY the recommended stages (not the full pipeline)
     4. Always end with Stage 12 (Verify) again
     5. If Stage 12 returns NO-SHIP a second time with `multi-issue`, run full loop from Stage 4
   - If context allows and there are more tasks, start next task

7. **Git commit** the final state change.

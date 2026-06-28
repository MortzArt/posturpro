---
name: standard
description: "Run the standard 5-stage pipeline: PlanResearch → (UI Design) → Dev → ReviewFix → QA. Balanced pipeline for medium-complexity features — faster than full-cycle, more thorough than quick."
---

# Standard Pipeline (Tier 2)

Run the 5-stage standard pipeline for medium-complexity tasks.

## When to Use

- New components or features that follow existing patterns
- Tasks touching 5-15 files
- Features that need planning but don't warrant full security/arch/UX audits
- When `/quick` is too light but `/full-cycle` is overkill

## Steps

1. **Read state files**:
   - Read `BUILD_PLAN.md` to find the first `[ ]` task
   - Read `tasks/pipeline-state.md` to check for interrupted sessions
   - If pipeline-state shows an in-progress standard-tier task, resume from the saved stage

2. **If no pending tasks** (all are `[x]`), enter **Continuous Improvement Mode**:
   - Read `PRODUCT_SPEC.md` and analyze the codebase
   - Identify the highest-impact improvement
   - Append a new `[ ]` task to `BUILD_PLAN.md`

3. **Initialize pipeline state**:

   ```
   # Pipeline State
   Task: [task name]
   Tier: standard
   Stage: 1
   Agent: ultraplanner-research
   Last Updated: [now]
   Notes: Starting standard pipeline
   ```

4. **Run stages in order**:

   | Stage            | Agent                 | Artifact                                                 | Notes                                                    |
   | ---------------- | --------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
   | S1: PlanResearch | ultraplanner-research | `tasks/next-ticket.md` + `tasks/research-report.md`      | Combined planning + research                             |
   | S2: UI Design    | ultradesign           | `tasks/ui-design.md`                                     | **Skip if backend-only** (read Feature Type from ticket) |
   | S3: Dev          | ultradev              | code + `tasks/dev-done.md`                               | Full implementation                                      |
   | S4: ReviewFix    | ultrareviewfix        | `tasks/review-findings.md` + updated `tasks/dev-done.md` | Combined review + fix in single pass                     |
   | S5: QA           | ultraqa               | tests + `tasks/qa-report.md`                             | Quality gate — tests must pass                           |

5. **Stage prompts**:

   **S1 — PlanResearch**:

   ```
   Task(
     subagent_type="ultraplanner-research",
     prompt="Standard pipeline — S1 (PlanResearch).
   Read BUILD_PLAN.md for the task: [task description].
   Read PRODUCT_SPEC.md for product context.
   Scan the codebase once. Produce BOTH:
   1. tasks/next-ticket.md (implementation ticket with Complexity classification)
   2. tasks/research-report.md (codebase analysis and research)
   One codebase scan, two outputs."
   )
   ```

   **S2 — UI Design** (skip if backend-only):

   ```
   Task(
     subagent_type="ultradesign",
     prompt="Standard pipeline — S2 (UI Design).
   Read tasks/next-ticket.md and tasks/research-report.md.
   Create component designs and interaction patterns.
   Write to tasks/ui-design.md."
   )
   ```

   **S3 — Dev**:

   ```
   Task(
     subagent_type="ultradev",
     prompt="Standard pipeline — S3 (Dev).
   Read tasks/next-ticket.md, tasks/research-report.md, and tasks/ui-design.md (if exists).
   Implement the feature completely. Zero TODOs.
   Write summary to tasks/dev-done.md."
   )
   ```

   **S4 — ReviewFix**:

   ```
   Task(
     subagent_type="ultrareviewfix",
     prompt="Standard pipeline — S4 (ReviewFix).
   Read tasks/next-ticket.md and tasks/dev-done.md.
   Review all changed files — find issues AND fix them in the same pass.
   Write findings to tasks/review-findings.md.
   Update tasks/dev-done.md with fixes section."
   )
   ```

   **S5 — QA**:

   ```
   Task(
     subagent_type="ultraqa",
     prompt="Standard pipeline — S5 (QA).
   Read tasks/next-ticket.md and tasks/dev-done.md.
   Write comprehensive tests — unit, integration, e2e.
   Write report to tasks/qa-report.md.
   If confidence is LOW, recommend re-running with /full-cycle."
   )
   ```

6. **After each stage**:
   - Update `tasks/pipeline-state.md` with next stage
   - Git commit: `git add -A && git commit -m "stage N (<agent>): <description> [standard]"`
   - Check context — if running low, save state and STOP

7. **After S5 (QA)**:
   - If QA passes → mark task `[x]` in BUILD_PLAN.md, set pipeline-state to COMPLETE
   - If QA recommends `/full-cycle` → update pipeline-state with note, inform user
   - No verify gate — QA serves as quality gate for standard tier

8. **Git commit** the final state change.

## Complexity Escalation

If the PlanResearch stage classifies the task as `high` complexity, the pipeline should:

1. Log a note in pipeline-state.md: "Task classified as high complexity — recommend /full-cycle"
2. Continue with standard pipeline (don't auto-switch — let the user decide)
3. QA stage should flag if coverage feels insufficient for the complexity level

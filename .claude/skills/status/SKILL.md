---
name: status
description: "Show pipeline progress instantly. No AI needed — reads tasks/pipeline-state.md and BUILD_PLAN.md to display current task, stage, tier, and overall progress."
---

# Pipeline Status

Show the current pipeline progress. This is a fast, no-AI operation.

## Steps

1. **Read `tasks/pipeline-state.md`** and display its contents formatted as:

```
Pipeline Status
===============
Task:    [task name]
Tier:    [quick / standard / full-cycle] (3 / 5 / 12 stages)
Stage:   [N] / [total] — [stage name]
Agent:   [agent name]
Updated: [timestamp]
Notes:   [any notes]
```

Tier-specific stage counts:

- **quick**: 3 stages (Dev → Review → Fix)
- **standard**: 5 stages (PlanResearch → UI Design → Dev → ReviewFix → QA)
- **full-cycle**: 12 stages (PlanResearch → UI Design → Dev → Review → Fix → QA → UX → Security → Arch → Hacker → Verify)
- If `Tier:` field is missing, default to `full-cycle` (backward compatibility)

2. **Read `BUILD_PLAN.md`** and count:
   - Total tasks
   - Completed tasks (`[x]`)
   - Pending tasks (`[ ]`)

3. **Display progress**:

```
Build Plan Progress
===================
Completed: X / Y tasks (Z%)
Next task: [first [ ] task, if any]
```

4. **List recent artifacts** (check which task files exist):

```
Stage Artifacts
===============
[✓] tasks/next-ticket.md          (Plan)
[✓] tasks/research-report.md      (Research)
[✓] tasks/ui-design.md            (UI Design)
[✓] tasks/dev-done.md             (Dev)
[ ] tasks/review-findings.md      (Review / ReviewFix)
[ ] tasks/qa-report.md            (QA)
[ ] tasks/ux-audit.md             (UX)
[ ] tasks/security-audit.md       (Security)
[ ] tasks/architecture-review.md  (Arch)
[ ] tasks/hacker-report.md        (Hacker)
[ ] tasks/ship-decision.md        (Verify)
```

Note: For standard tier, only the first 5 artifacts are relevant. For quick tier, only dev-done.md and review-findings.md are relevant.

This command does NOT run any agents or make any changes.

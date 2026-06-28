---
name: manager
description: "Generate an AI progress report with completion percentage, quality scores from recent audits, and recommendations for next steps."
---

# Manager Report

Generate a comprehensive progress report with AI analysis.

## Steps

1. **Read all state files**:
   - `BUILD_PLAN.md` — task completion status
   - `tasks/pipeline-state.md` — current pipeline position
   - `PRODUCT_SPEC.md` — product scope

2. **Read all available task artifacts** (only those that exist):
   - `tasks/next-ticket.md`
   - `tasks/dev-done.md`
   - `tasks/review-findings.md`
   - `tasks/qa-report.md`
   - `tasks/ux-audit.md`
   - `tasks/security-audit.md`
   - `tasks/architecture-review.md`
   - `tasks/hacker-report.md`
   - `tasks/ship-decision.md`

3. **Analyze and generate report**:

```markdown
# Progress Report — [Date]

## Overall Status: [On Track / At Risk / Blocked]

## Build Plan Progress
- Tasks completed: X / Y (Z%)
- Current task: [name]
- Current stage: [N] / 12

## Quality Metrics (from latest audits)
| Metric | Score | Trend |
|--------|-------|-------|
| Code Review | X/10 | [up/down/stable] |
| QA Confidence | HIGH/MED/LOW | [trend] |
| UX Score | X/10 | [trend] |
| Security | SECURE/NEEDS FIXES | [trend] |
| Architecture | X/10 | [trend] |
| Chaos Score | X/10 | [trend] |
| Ship Decision | X/10 | [trend] |

## Recent Accomplishments
- [what was shipped recently]

## Current Blockers
- [any blocking issues]

## Recommendations
1. [highest priority recommendation]
2. [second priority]
3. [third priority]

## Estimated Completion
- Current task: [estimate based on remaining stages]
- Full BUILD_PLAN: [estimate based on remaining tasks]
```

4. **Display the report** to the user.

This command reads files and generates analysis but does NOT modify any code or state files.

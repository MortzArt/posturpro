# CLAUDE.md — PosturPro

## AUTONOMOUS MULTI-AGENT PIPELINE — MASTER ORCHESTRATOR

You are the **Master Orchestrator** for the PosturPro build pipeline. You coordinate specialized agents to autonomously plan, build, review, test, audit, and ship features. Execute end-to-end; don't stop to ask unless a decision is genuinely ambiguous or destructive.

### Pipeline Tiers

| Tier       | Skill         | Stages                                               | Use For                                  | Est. Time  |
| ---------- | ------------- | ---------------------------------------------------- | ---------------------------------------- | ---------- |
| Quick      | \`/quick\`      | 3: Dev → Review → Fix                                | Bug fixes, pattern copies, ticket exists | ~15 min    |
| Standard   | \`/standard\`   | 5: PlanResearch → (UI Design) → Dev → ReviewFix → QA | Medium features, new components          | ~25-35 min |
| Full Cycle | \`/full-cycle\` | 8-12: auto-classified after planning                 | New systems, architectural, high-risk    | ~50-80 min |

Task complexity determines pipeline depth. \`/full-cycle\` auto-classifies after planning: \`low\` → standard flow, \`medium\` → skip hacker, \`high\` → all stages.

### On Session Start

1. Read \`BUILD_PLAN.md\` and \`tasks/pipeline-state.md\`
2. **If there's an incomplete task** (pipeline-state shows stage > 0 and not COMPLETE) → resume from saved stage and tier
3. **If all BUILD_PLAN tasks are \`[x]\`** → enter **Continuous Improvement Mode**:
   - Read \`PRODUCT_SPEC.md\` for unbuilt/incomplete features
   - Analyze codebase for gaps, tech debt, missing tests, UX regressions, performance issues
   - Prioritize the highest-impact improvement
   - Append a new \`[ ]\` task to \`BUILD_PLAN.md\`
   - Run the pipeline for that task (choose tier based on complexity)
4. Run pipeline stages IN ORDER (or from a specific stage if using \`/from\`)
5. After each stage: update \`tasks/pipeline-state.md\`, git commit
6. **Quality gate** depends on tier:
   - **Quick**: Report after Fix
   - **Standard**: QA serves as quality gate (no verify stage)
   - **Full Cycle**: Stage 12 (Verify) returns SHIP or NO-SHIP
7. **Context management**: After each stage, check context usage. If low: save state, git commit, STOP. User types \`continue\` to resume.

---

## Pipeline Stages

| #   | Stage     | Agent           | Skill        | Artifact                           | Parallel | Description                                                 |
| --- | --------- | --------------- | ------------ | ---------------------------------- | -------- | ----------------------------------------------------------- |
| 1   | Plan      | \`ultraplanner\`  | \`/plan\`      | \`tasks/next-ticket.md\`             | —        | Product planning, ticket, acceptance criteria, feature type |
| 2   | Research  | \`ultraresearch\` | \`/research\`  | \`tasks/research-report.md\`         | —        | Codebase analysis, pattern discovery, dependency research   |
| 3   | UI Design | \`ultradesign\`   | \`/ui-design\` | \`tasks/ui-design.md\`               | —        | Component design, interaction patterns, wireframes          |
| 4   | Dev       | \`ultradev\`      | \`/dev\`       | \`tasks/dev-done.md\` + code         | —        | Full implementation — production-ready, zero TODOs          |
| 5   | Review    | \`ultrareview\`   | \`/review\`    | \`tasks/review-findings.md\`         | —        | Adversarial code review, line-by-line, security check       |
| 6   | Fix       | \`ultrafix\`      | \`/fix\`       | Updated code + \`tasks/dev-done.md\` | —        | Fix all critical/major review findings systematically       |
| 7   | QA        | \`ultraqa\`       | \`/qa\`        | \`tasks/qa-report.md\` + tests       | —        | Unit, integration, e2e tests — 100% acceptance criteria     |
| 8   | UX        | \`ultraux\`       | \`/ux\`        | \`tasks/ux-audit.md\` + fixes        | —        | UX audit, polish, states, accessibility, responsiveness     |
| 9   | Security  | \`ultrasecurity\` | \`/security\`  | \`tasks/security-audit.md\` + fixes  | 9+10     | Security audit, dependency/secret scan, fix critical/high   |
| 10  | Arch      | \`ultraarch\`     | \`/arch\`      | \`tasks/architecture-review.md\`     | 9+10     | Architecture review, scalability, pattern compliance        |
| 11  | Hacker    | \`ultrahacker\`   | \`/hacker\`    | \`tasks/hacker-report.md\` + fixes   | —        | Chaos testing, dead UI, visual bugs, edge cases             |
| 12  | Verify    | \`ultraverify\`   | \`/verify\`    | \`tasks/ship-decision.md\`           | —        | Final gate — all tests pass, SHIP/NO-SHIP verdict           |

## Utility Commands

| Skill           | Description                                                           |
| --------------- | --------------------------------------------------------------------- |
| \`/full-cycle\`   | Run full pipeline with auto-classification (8-12 stages)              |
| \`/standard\`     | Balanced 5-stage pipeline: PlanResearch → Dev → ReviewFix → QA        |
| \`/quick\`        | Minimal 3-stage loop: Dev → Review → Fix                              |
| \`/from <stage>\` | Run pipeline from a named stage (e.g., \`/from dev\`)                   |
| \`/status\`       | Show pipeline progress instantly (no AI, reads state file)            |
| \`/manager\`      | AI progress report with completion %, quality scores, recommendations |
| \`/abort\`        | Gracefully stop the running pipeline, save state                      |
| \`/commit\`       | Smart git commit — groups changes by logic, separate commits          |

## Pipeline State Tracking

\`tasks/pipeline-state.md\` persists progress across context resets:

\`\`\`
# Pipeline State
Task: [task name/number]
Tier: [quick / standard / full-cycle]
Stage: [1-12 or COMPLETE]
Agent: [agent name that should run next]
Last Updated: [YYYY-MM-DD HH:MM]
Notes: [any context needed for resuming]
\`\`\`

Update this file after EVERY stage. Git commit after EVERY stage:

\`\`\`bash
git add -A && git commit -m "stage N (<agent>): <description>"
\`\`\`

## Agent Orchestration

Each stage delegates to its specialized agent via the **Task tool**:

\`\`\`
Task(subagent_type="<agent-name>", prompt="<stage instructions + context>")
\`\`\`

**Pass these inputs to every agent:**

- The current task description (from \`tasks/next-ticket.md\` or pipeline state)
- Relevant artifact files from prior stages
- The project's conventions (this file)

**Collect outputs from every agent:**

- The artifact file for that stage
- Any code changes made
- Status: success/failure/blocked

## Skills Matrix

All agents have access to these tools and must follow these conventions:

| Capability     | Tool / Convention        | Notes                                |
| -------------- | ------------------------ | ------------------------------------ |
| Read files     | Read tool                | Always read before writing           |
| Edit files     | Edit tool                | Prefer over Write for existing files |
| Write files    | Write tool               | Only for new files                   |
| Search files   | Glob tool                | Pattern matching for file discovery  |
| Search content | Grep tool                | Regex search across codebase         |
| Run commands   | Bash tool                | Git, npm, playwright, etc.           |
| Web research   | WebSearch, WebFetch      | External docs, API references        |
| Subagents      | Task tool                | Delegate specialized work            |

---

## Feature Type Classification

The planner (Stage 1) classifies each task as one of:

- **\`ui-only\`** — Component/styling changes. Security & Arch run lightweight.
- **\`logic-only\`** — Hooks, state, data-fetching, utils. Skip UI Design (3) and UX (8) if no visible surface changes.
- **\`full-feature\`** — Both UI and logic. All stages at full depth.

The full-cycle skill reads this from \`tasks/next-ticket.md\` and adjusts which stages run.

## Rules

1. **Never skip stages. Never reorder stages.** (Stage skipping only allowed by Feature Type rules above.)
2. **Never recreate files** that already exist unless modifying them.
3. **Respect \`blocked by\` dependencies** in BUILD_PLAN.md.
4. **Git commit after each stage** with a descriptive message.
5. **Always read existing code** before writing new code — follow established patterns.
6. **No placeholders, no TODOs** — every stage produces complete, production-ready output.
7. **Agents run autonomously** — don't micro-manage; trust the agent prompt.
8. **If a stage fails**, don't retry blindly — analyze the failure and adjust.

---

## Tech Stack

- **Next.js** (App Router)
- **TypeScript** — strict mode
- **Tailwind CSS**
- **shadcn/ui**
- Package manager: npm

## Frontend Rules

- shadcn/ui first — check before building custom
- Tailwind only — no CSS modules
- \`cn()\` for conditional classes
- Server components default, \`"use client"\` only when needed
- Data fetching via typed wrappers in \`src/lib/\`
- lucide-react for icons — never mix icon sets
- Strict TypeScript typing — no \`any\`, no non-null \`!\` to silence the compiler
- Never commit secrets; all config via environment variables (\`.env*\` is gitignored)
- No secret ever prefixed \`NEXT_PUBLIC_\`

## Clean Code Rules (Uncle Bob)

Apply to ALL new code and every file you touch (Boy-Scout Rule: leave it cleaner than you found it). Open findings are tracked in \`tasks/clean-code-backlog.md\` — check items off there when you fix them.

- **Small functions** — target ≤ 30 lines, one level of abstraction per function. Never add to a function already over 50 lines: extract first.
- **Small files** — no new file over ~400 lines; never grow a 1,000+ line file, split instead.
- **One reason to change (SRP)** — a module owns one concern. Components render, hooks manage state/effects, lib/utils compute. No business logic buried in components.
- **DRY with judgment** — before writing a component/helper, grep for an existing one. Don't copy-paste a sibling file.
- **No magic values** — numbers and status strings get a named constant; timeouts/durations end in a unit (\`_MS\`, \`_SECONDS\`).
- **Errors are never silenced** — no empty \`catch {}\`. Narrow the error, log with context, or let it raise.
- **Names reveal intent** — no single-letter variables outside trivial comprehensions; no \`_v2\`/\`_new\`/\`_old\` suffixes (delete the loser instead).
- **Boundaries stay typed** — public function signatures are fully typed; the frontend never uses \`any\` or \`!\` to silence the compiler.
- **No dead code, no TODO-and-forget** — delete unused code (git remembers); a TODO must reference a ticket or a \`tasks/clean-code-backlog.md\` entry.
- **Tests accompany refactors** — decomposing a complex function requires characterization tests first; behavior-preserving edits state how they were verified in the commit message.

## Context Management

Context is your most important resource. Proactively use subagents (Task tool) to keep exploration, research, and verbose operations out of the main conversation.

**Default to spawning agents for:**

- Codebase exploration (reading 3+ files to answer a question)
- Research tasks (web searches, doc lookups, investigating how something works)
- Code review or analysis (produces verbose output)
- Any investigation where only the summary matters

**Stay in main context for:**

- Direct file edits the user requested
- Short, targeted reads (1-2 files)
- Conversations requiring back-and-forth
- Tasks where the user needs intermediate steps

**Rule of thumb:** If a task will read more than ~3 files or produce output the user doesn't need to see verbatim, delegate it to a subagent and return a concise summary.

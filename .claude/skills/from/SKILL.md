---
name: from
description: "Run the pipeline from a specific stage. Usage: /from <stage-name>. Supports both full-cycle stages (plan, research, ui-design, dev, review, fix, qa, ux, security, arch, hacker, verify) and standard tier stages (plan-research, ui-design, dev, reviewfix, qa). Reads tier from pipeline-state.md."
---

# Run Pipeline From Stage

Resume or start the pipeline from a specific stage, running through to the final stage of the current tier.

## Usage

`/from <stage-name>`

## Stage Maps

### Full-Cycle Tier (default)

| Name          | Stage # | Agent                 |
| ------------- | ------- | --------------------- |
| plan-research | 1+2     | ultraplanner-research |
| plan          | 1       | ultraplanner          |
| research      | 2       | ultraresearch         |
| ui-design     | 3       | ultradesign           |
| dev           | 4       | ultradev              |
| review        | 5       | ultrareview           |
| fix           | 6       | ultrafix              |
| qa            | 7       | ultraqa               |
| ux            | 8       | ultraux               |
| security      | 9       | ultrasecurity         |
| arch          | 10      | ultraarch             |
| hacker        | 11      | ultrahacker           |
| verify        | 12      | ultraverify           |

### Standard Tier

| Name          | Stage # | Agent                 |
| ------------- | ------- | --------------------- |
| plan-research | S1      | ultraplanner-research |
| ui-design     | S2      | ultradesign           |
| dev           | S3      | ultradev              |
| reviewfix     | S4      | ultrareviewfix        |
| qa            | S5      | ultraqa               |

### Quick Tier

| Name   | Stage # | Agent       |
| ------ | ------- | ----------- |
| dev    | 1       | ultradev    |
| review | 2       | ultrareview |
| fix    | 3       | ultrafix    |

## Steps

1. **Parse the stage name** from the user's input (the argument after `/from`)
2. **Read `tasks/pipeline-state.md`** for the current task context and **Tier** field
3. **Determine tier**:
   - If `Tier:` field exists in pipeline-state → use that tier's stage map
   - If stage name is `plan-research` or `reviewfix` → use standard tier
   - If no tier specified and stage name matches full-cycle → default to full-cycle
   - Old stage names (`plan`, `research`, `review`, `fix`) always default to full-cycle tier
4. **Map to stage number** using the appropriate tier's table
5. **Update pipeline state** to the starting stage
6. **Run all stages from N through the final stage** of the tier:
   - For each stage: launch the corresponding agent via Task tool
   - After each stage: update pipeline-state.md, git commit
   - Pass appropriate artifacts to each agent (see `/full-cycle` or `/standard` for the artifact chain)
7. **At final stage**: Handle completion as per the tier's rules:
   - Full-cycle: SHIP/NO-SHIP at Stage 12
   - Standard: QA serves as quality gate at S5
   - Quick: Report after Fix

## Examples

### Full-Cycle

`/from review` → Runs stages 5, 6, 7, 8, 9, 10, 11, 12 (Review → Fix → QA → UX → Security → Arch → Hacker → Verify)

`/from qa` → Runs stages 7, 8, 9, 10, 11, 12 (QA → UX → Security → Arch → Hacker → Verify)

### Standard

`/from dev` (with Tier: standard in pipeline-state) → Runs S3, S4, S5 (Dev → ReviewFix → QA)

`/from reviewfix` → Runs S4, S5 (ReviewFix → QA) — auto-detects standard tier

### Quick

`/from review` (with Tier: quick in pipeline-state) → Runs stages 2, 3 (Review → Fix)

---
name: security
description: "Run only the security audit stage (Stage 9). Launches the ultrasecurity agent to audit for OWASP Top 10, secrets, auth bypass, and data exposure — and fix critical/high issues."
---

# Security Stage (Stage 9)

Run the ultrasecurity agent for a security audit.

## Steps

1. **Read inputs**:
   - Read `tasks/dev-done.md` for what was implemented
   - Read `tasks/next-ticket.md` for the feature scope
   - Read `tasks/pipeline-state.md` for context

2. **Launch the ultrasecurity agent** via the Task tool:
   ```
   Task(
     subagent_type="ultrasecurity",
     prompt="You are running Stage 9 (Security) of the pipeline.

   Read tasks/dev-done.md for the implementation summary.
   Read tasks/next-ticket.md for the feature scope.
   Audit all changed code for OWASP Top 10, secrets, auth bypass, and data exposure.
   Check Next.js specifics: no secret prefixed NEXT_PUBLIC_, no server-only secrets imported into client components or \"use client\" files.
   Scan dependencies for known vulnerabilities (npm audit).
   Fix all critical and high severity issues directly. Run tests after fixes.
   Write your audit to tasks/security-audit.md.

   Follow all instructions in your agent prompt."
   )
   ```

3. **After the agent completes**:
   - Verify `tasks/security-audit.md` was written
   - Update `tasks/pipeline-state.md`
   - Git commit: `git add -A && git commit -m "stage 9 (ultrasecurity): security audit for [task name]"`

4. **Report** the security verdict (SECURE / NEEDS FIXES) and any remaining medium/low findings to the user.

---
name: abort
description: "Gracefully stop the running pipeline. Saves the current state to tasks/pipeline-state.md so the pipeline can be resumed later with /from or /full-cycle."
---

# Abort Pipeline

Gracefully stop the running pipeline and save state for later resumption.

## Steps

1. **Save current state** — Update `tasks/pipeline-state.md`:
   ```
   # Pipeline State
   Task: [current task name]
   Stage: [current stage number]
   Agent: [agent that should run next]
   Last Updated: [now]
   Notes: Pipeline aborted by user. Resume with /from [next-stage-name] or /full-cycle.
   ```

2. **Stop any running background agents** — Use TaskStop if any agents are running in the background.

3. **Git commit** the state:
   ```bash
   git add -A && git commit -m "pipeline: aborted at stage N, state saved"
   ```

4. **Report** to the user:
   ```
   Pipeline Aborted
   ================
   Task:       [task name]
   Stopped at: Stage [N] ([stage name])
   State:      Saved to tasks/pipeline-state.md

   To resume:
     /full-cycle  — Resume from saved stage
     /from [name] — Resume from a specific stage
     /status      — Check current state
   ```

This command saves state and stops. No further stages are executed.

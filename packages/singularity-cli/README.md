# singularity-cli

Workflow orchestration CLI for humans and AI agents. Define multi-step workflows in YAML, provision agents with cron-based polling, and track execution state in a local SQLite database.

## Requirements

- Node.js >= 22
- pnpm (for development)

## Installation

```bash
# From the monorepo root
pnpm install && pnpm build

# Link globally
pnpm --filter singularity-cli link --global
```

## Usage

```
singularity <command> [options]

Commands:
  install                     Provision all workflows
  uninstall [--force]         Full teardown
  workflow run <id> <task>    Start a workflow run
  workflow status <query>     Check run status
  workflow list               List available workflows
  workflow runs               List all runs
  workflow resume <run-id>    Resume a failed run
  workflow stop <run-id>      Cancel a running run
  workflow install <id>       Install a single workflow
  workflow uninstall <id>     Remove a single workflow
  step claim                  Agent: check for work
  step complete               Agent: report success
  step fail                   Agent: report failure
  step stories                Agent: list stories for loop step
  dashboard                   Start monitoring dashboard
  logs [<lines>]              View recent events
  version                     Show version
```

## Workflows

Workflows are defined as YAML files in the `workflows/` directory. Each workflow declares a set of agents and an ordered pipeline of steps.

### Included Workflows

| Workflow | Agents | Steps | Description |
|----------|--------|-------|-------------|
| `feature-dev` | 7 | 7 | End-to-end feature development: plan, setup, develop, verify, test, PR, review |
| `bug-fix` | 6 | 6 | Bug fix pipeline: triage, reproduce, fix, verify, test, review |

### Running a Workflow

```bash
# List available workflows
singularity workflow list

# Start a run
singularity workflow run feature-dev "Add user authentication"

# Check progress
singularity workflow status auth

# View all runs
singularity workflow runs
```

### Agent Lifecycle

Agents are provisioned as cron jobs that poll for work:

```bash
# Install all workflows (creates agents + cron jobs)
singularity install

# Agent claims a step
singularity step claim --workflow feature-dev --agent feature-dev_developer

# Agent reports success (reads output from stdin)
echo "STATUS: done" | singularity step complete --step <uuid>

# Agent reports failure (triggers retry or escalation)
echo "Error details" | singularity step fail --step <uuid>
```

### Pipeline

Steps execute sequentially. When a step completes, the pipeline automatically advances the next step to `ready` status. If all steps complete, the run is marked `done`.

Failed steps are retried according to the workflow's `on_fail` configuration:
- `retry_step` — jump back to an earlier step with feedback
- `max_retries` — limit retry attempts
- `on_exhausted.escalate_to: human` — escalate to a human when retries are exhausted

## State

All state is stored in SQLite at `~/.singularity/state.db`:
- **runs** — workflow executions with status tracking
- **steps** — individual pipeline steps with retry counts
- **stories** — sub-tasks for loop-type steps
- **events** — audit log of all state transitions

## Project Structure

```
src/
  cli.ts                        Entry point
  db.ts                         SQLite state management
  paths.ts                      Centralized path resolution
  pipeline.ts                   Step advancement state machine
  installer/
    types.ts                    Workflow and DB row types
    workflow-spec.ts            YAML parser + validator
    gateway-api.ts              Agent/cron provisioning via SDK
    agent-cron.ts               Polling prompt builder + schedule staggering
  commands/
    install.ts                  Provision all workflows
    uninstall.ts                Full teardown
    logs.ts                     Event log viewer
    dashboard.ts                Dashboard stub
    workflow/
      list.ts, run.ts, status.ts, runs.ts,
      resume.ts, stop.ts, install.ts, uninstall.ts
    step/
      claim.ts, complete.ts, fail.ts, stories.ts
workflows/                      YAML workflow definitions
agents/                         Agent configuration files (AGENTS.md, SOUL.md)
```

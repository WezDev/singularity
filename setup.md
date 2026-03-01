# Singularity Setup Guide

Singularity is a multi-agent workflow orchestrator. It provisions agents as cron-based polling workers that claim steps from a shared run database, execute them, and advance the pipeline.

## Prerequisites

- Node.js >= 22
- [OpenClaw](https://docs.openclaw.ai) installed and running (`openclaw doctor` to verify)
- pnpm

## Install

```bash
pnpm install
pnpm build
```

## Concepts

### Workflows

A workflow is a YAML file that defines a sequence of **steps**, each assigned to an **agent**. Steps run serially — when one completes, the next becomes ready.

### Agents

Agents are OpenClaw agents provisioned with a workspace directory containing instruction files (like `AGENTS.md`). Each agent gets a cron job that polls the run database for work every 15 minutes.

### Runs

A run is a single execution of a workflow against a task (e.g. "Fix the login bug"). It creates one step per workflow step, tracks status, and advances through the pipeline automatically.

### Steps

Steps transition through: `pending` → `ready` → `running` → `done` (or `failed`). Only the first step starts as `ready`; subsequent steps unlock as previous ones complete.

### Template Variables

Steps pass data forward. Agent output lines matching `KEY: value` become template variables (`{{key}}`) available in later steps' inputs.

---

## Creating a Workflow

### 1. Define the YAML spec

Create a file in `packages/singularity-cli/workflows/`. Example `my-workflow.yaml`:

```yaml
id: my-workflow
name: My Workflow
version: 1
description: A simple two-agent workflow.

agents:
  - id: planner
    name: Planner
    role: analysis
    description: Breaks down the task into actionable steps.
    workspace:
      files:
        AGENTS.md: agents/my-workflow/planner/AGENTS.md

  - id: executor
    name: Executor
    role: coding
    description: Implements the plan.
    timeoutSeconds: 1200
    workspace:
      files:
        AGENTS.md: agents/my-workflow/executor/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: |
      Task: {{task}}

      Analyze this task and create a plan.

      Reply with:
      STATUS: done
      PLAN_NOTES: <your plan>
    expects: "STATUS: done"

  - id: execute
    agent: executor
    input: |
      Task: {{task}}

      Plan:
      {{plan_notes}}

      Implement the plan above.

      Reply with:
      STATUS: done
      RESULT: <summary of what was done>
    expects: "STATUS: done"
```

Key points:
- `agents[].workspace.files` maps destination filenames to source paths (relative to the package root)
- `steps[].input` uses `{{task}}` for the run's task and `{{key}}` for outputs from prior steps
- `steps[].expects` defines the completion marker the agent must output

### 2. Create agent instruction files

Create the agent workspace files referenced in the YAML:

```
packages/singularity-cli/agents/my-workflow/
├── planner/
│   └── AGENTS.md
└── executor/
    └── AGENTS.md
```

Each `AGENTS.md` tells the agent what it does and how to format output. Example for the planner:

```markdown
# Planner Agent

You analyze tasks and create implementation plans.

## Responsibilities
- Break down the task into clear steps
- Identify risks and dependencies
- Estimate complexity

## Output Format
Always reply with:
- STATUS: done
- PLAN_NOTES: your detailed plan
```

### 3. Install the workflow

This registers agents in OpenClaw and creates their cron jobs:

```bash
# Install a single workflow
singularity workflow install my-workflow

# Or install all workflows at once
singularity install
```

What `install` does:
- Initializes the SQLite database at `~/.openclaw/singularity/state.db`
- Creates agent workspaces at `~/.openclaw/workspace/workflows/<workflow-id>/<agent-id>/`
- Copies agent files (AGENTS.md, etc.) into each workspace
- Registers each agent in OpenClaw via the SDK
- Creates a staggered cron job for each agent (every 15 minutes, offset to prevent thundering herd)

### 4. Verify installation

```bash
# List installed workflows
singularity workflow list

# Check cron jobs were created (via OpenClaw)
openclaw cron list
```

---

## Running a Workflow

### Start a run

```bash
singularity workflow run my-workflow "Build a REST API for user management"
```

This creates a run in the database with one step per workflow step. The first step is marked `ready` for the assigned agent to pick up.

### Check status

```bash
# Find a run by task keyword
singularity workflow status "REST API"

# List all runs
singularity workflow runs

# View event log
singularity logs
singularity logs 100  # last 100 events
```

### Stop a run

```bash
singularity workflow stop <run-id>
```

### Resume a failed run

```bash
singularity workflow resume <run-id>
```

This finds the first failed step, resets it to `ready`, and lets agents pick it up again.

---

## How Agent Polling Works

Each agent has a cron job that fires every 15 minutes. The cron prompt tells the agent to run:

```
singularity step claim --workflow <workflow-id> --agent <agent-id>
```

**If no work is available:** the command prints `NO_WORK` and the agent replies with `HEARTBEAT_OK`.

**If work is found:** the command prints the step ID and the resolved input (with template variables filled in from previous steps' outputs). The agent processes the task and reports back:

```bash
# On success:
echo "STATUS: done
RESULT: <output>" | singularity step complete --step <step-id>

# On failure:
echo "Error details" | singularity step fail --step <step-id>
```

When a step completes, `advancePipeline()` automatically marks the next pending step as `ready`.

---

## Advanced Features

### Retry & Backtracking

Steps can define failure handling that jumps back to an earlier step:

```yaml
steps:
  - id: verify
    agent: verifier
    input: |
      Check if the implementation is correct.
      {{implementation_notes}}
    expects: "STATUS: done"
    on_fail:
      retry_step: implement    # jump back to this step on failure
      max_retries: 3
      on_exhausted:
        escalate_to: human     # give up after 3 retries
```

When verify fails, the `implement` step is re-queued as `ready` with `VERIFY_FEEDBACK` prepended to its input so the agent knows what to fix.

### Loop Steps (Stories)

A step can iterate over a set of stories produced by a prior step:

```yaml
steps:
  - id: plan
    agent: planner
    input: |
      Break this into stories.
      Reply with:
      STATUS: done
      STORIES_JSON: [{"title": "Story 1", "description": "...", "acceptanceCriteria": ["..."]}]
    expects: "STATUS: done"

  - id: implement
    agent: developer
    type: loop
    loop:
      over: stories
      completion: all_done
    input: |
      Implement the next story.
    expects: "STATUS: done"
```

The planner's `STORIES_JSON` output is parsed and inserted into the database. The developer can list them with `singularity step stories --step <step-id>`.

---

## Uninstalling

```bash
# Remove a single workflow (agents, cron jobs, workspace, and DB records)
singularity workflow uninstall my-workflow

# Remove everything
singularity uninstall
singularity uninstall --force  # suppress errors for missing resources
```

---

## Database

State is stored in `~/.openclaw/singularity/state.db` (SQLite). Tables:

| Table | Purpose |
|-------|---------|
| `runs` | Workflow executions (id, workflow, task, status) |
| `steps` | Individual step state (status, input, output, retry_count) |
| `stories` | Loop step items with acceptance criteria |
| `events` | Audit log of all state transitions |

---

## Directory Layout

```
packages/singularity-cli/
├── workflows/           # Workflow YAML definitions
│   ├── bug-fix.yaml
│   └── feature-dev.yaml
├── agents/              # Agent instruction files
│   ├── bug-fix/
│   │   ├── triager/AGENTS.md
│   │   ├── fixer/AGENTS.md
│   │   └── ...
│   └── feature-dev/
│       ├── planner/
│       │   ├── AGENTS.md
│       │   └── SOUL.md
│       └── ...
└── src/
    ├── cli.ts                    # CLI entry point & router
    ├── db.ts                     # Database schema & helpers
    ├── pipeline.ts               # advancePipeline() state machine
    ├── paths.ts                  # Resolves workflows/ and agents/ dirs
    ├── installer/
    │   ├── types.ts              # WorkflowSpec, WorkflowAgent, WorkflowStep
    │   ├── workflow-spec.ts      # YAML parser & validator
    │   ├── gateway-api.ts        # SDK calls to create agents & cron jobs
    │   └── agent-cron.ts         # Polling prompt & schedule staggering
    └── commands/
        ├── install.ts            # singularity install
        ├── uninstall.ts          # singularity uninstall
        ├── logs.ts               # singularity logs
        ├── workflow/
        │   ├── run.ts            # workflow run
        │   ├── status.ts         # workflow status
        │   ├── list.ts           # workflow list
        │   ├── runs.ts           # workflow runs
        │   ├── install.ts        # workflow install
        │   ├── uninstall.ts      # workflow uninstall
        │   ├── resume.ts         # workflow resume
        │   └── stop.ts           # workflow stop
        └── step/
            ├── claim.ts          # step claim (agent polling)
            ├── complete.ts       # step complete (agent reports success)
            ├── fail.ts           # step fail (agent reports failure)
            └── stories.ts        # step stories (list loop items)

~/.openclaw/singularity/
├── state.db                      # SQLite database
└── workspaces/workflows/         # Agent workspace directories
    ├── bug-fix/
    │   ├── triager/AGENTS.md
    │   └── ...
    └── feature-dev/
        ├── planner/
        │   ├── AGENTS.md
        │   └── SOUL.md
        └── ...
```

# CLI Scaffolding Guide — OpenClaw SDK Workflow CLI

## Overview

This document describes the CLI tool you need to build. It is modeled after [Antfarm](https://github.com/snarktank/antfarm), a multi-agent workflow orchestrator for OpenClaw. The CLI is a TypeScript project using Node.js >= 22 with `node:sqlite` (built-in, zero dependencies for the database layer).

The CLI has two audiences:
- **Humans** — run workflows, check status, manage the system
- **Agents** — called automatically during cron-triggered sessions to claim and complete work

---

## Architecture Summary

```
You (human)                          Agents (via cron)
    │                                      │
    ▼                                      ▼
┌──────────────────────────────────────────────┐
│                   CLI                        │
│                                              │
│  workflow run / status / list     step claim  │
│  install / uninstall             step complete│
│  dashboard                       step fail    │
└───────────────────┬──────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌──────────────┐
   │ SQLite  │ │openclaw  │ │  Filesystem  │
   │  (state)│ │  .json   │ │ (workspaces) │
   └─────────┘ │  (agents │ └──────────────┘
               │  + cron) │
               └─────────┘
```

**Key paths:**
- SQLite DB: `~/.openclaw/<tool-name>/state.db`
- Workflow definitions: bundled in the CLI or in a `workflows/` directory
- Agent workspaces: `~/.openclaw/workspaces/workflows/<workflow-id>/<agent-id>/`
- Cron jobs: managed via OpenClaw's cron API (`sdk.cron.create()` / CLI fallback)
- Agent config: entries added to `~/.openclaw/openclaw.json` agents array

---

## File Structure

```
src/
├── cli.ts                  # Entry point — argument parsing and command routing
├── db.ts                   # SQLite schema, connection, and CRUD operations
├── commands/
│   ├── install.ts          # antfarm install
│   ├── uninstall.ts        # antfarm uninstall
│   ├── workflow/
│   │   ├── run.ts          # antfarm workflow run <id> <task>
│   │   ├── status.ts       # antfarm workflow status <query>
│   │   ├── list.ts         # antfarm workflow list
│   │   ├── runs.ts         # antfarm workflow runs
│   │   ├── resume.ts       # antfarm workflow resume <run-id>
│   │   ├── stop.ts         # antfarm workflow stop <run-id>
│   │   ├── install.ts      # antfarm workflow install <id>
│   │   └── uninstall.ts    # antfarm workflow uninstall <id>
│   ├── step/
│   │   ├── claim.ts        # antfarm step claim --workflow <id> --agent <id>
│   │   ├── complete.ts     # antfarm step complete --step <uuid>
│   │   ├── fail.ts         # antfarm step fail --step <uuid>
│   │   └── stories.ts      # antfarm step stories --step <uuid>
│   ├── dashboard.ts        # antfarm dashboard [start|stop|status]
│   └── logs.ts             # antfarm logs [<lines>]
├── installer/
│   ├── gateway-api.ts      # HTTP calls to OpenClaw gateway or CLI fallback
│   ├── workflow-spec.ts    # YAML workflow definition parser + validator
│   ├── types.ts            # TypeScript types for workflows, agents, steps
│   └── agent-cron.ts       # Prompt builders (polling prompt + work prompt)
├── pipeline.ts             # Pipeline state machine — advancing steps, retry logic
└── dashboard/
    └── server.ts           # Local HTTP server serving dashboard UI
```

---

## Database Schema (db.ts)

Use `node:sqlite` (DatabaseSync). The database is the single source of truth for all workflow state.

```sql
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,           -- UUID
    workflow TEXT NOT NULL,         -- workflow definition ID (e.g. "feature-dev")
    task TEXT NOT NULL,             -- human-provided task description
    status TEXT DEFAULT 'running',  -- running | done | failed | stopped
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS steps (
    id TEXT PRIMARY KEY,            -- UUID
    run_id TEXT NOT NULL,           -- FK to runs
    step_name TEXT NOT NULL,        -- from workflow definition (e.g. "plan", "implement")
    agent_id TEXT NOT NULL,         -- openclaw agent ID (e.g. "feature-dev_planner")
    status TEXT DEFAULT 'pending',  -- pending | ready | running | done | failed
    input TEXT,                     -- rendered input template with variables
    output TEXT,                    -- KEY: value pairs from agent output
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    created_at TEXT DEFAULT (datetime('now')),
    claimed_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,            -- UUID
    step_id TEXT NOT NULL,          -- FK to steps (the loop step)
    title TEXT NOT NULL,
    description TEXT,
    acceptance_criteria TEXT,        -- JSON array of strings
    status TEXT DEFAULT 'pending',  -- pending | running | done | failed
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 2,
    output TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (step_id) REFERENCES steps(id)
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    step_id TEXT,
    event_type TEXT NOT NULL,       -- run.created | step.claimed | step.completed | step.failed | run.completed | etc.
    details TEXT,                   -- JSON blob with extra context
    created_at TEXT DEFAULT (datetime('now'))
);
```

**DB helper pattern:**

```typescript
import { DatabaseSync } from "node:sqlite";
import { resolve } from "path";
import { homedir } from "os";

const DB_PATH = resolve(homedir(), ".openclaw/<tool-name>/state.db");

export function getDb(): DatabaseSync {
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode=WAL");  // safe for concurrent cron access
    return db;
}

export function initDb(): void {
    const db = getDb();
    db.exec(SCHEMA_SQL);
}
```

---

## Command Specifications

### `install`

**Purpose:** One-time setup that provisions the entire system.

**What it must do (in order):**

1. Initialize SQLite database (create tables if not exist)
2. For each bundled workflow:
   a. Parse the workflow YAML definition
   b. For each agent defined in the workflow:
      - Create agent workspace directory at `~/.openclaw/workspaces/workflows/<workflow-id>/<agent-id>/`
      - Copy agent files (AGENTS.md, SOUL.md, IDENTITY.md) into the workspace
      - Register the agent in `~/.openclaw/openclaw.json` agents array with:
        - `id`: `<workflow-id>_<agent-id>` (underscore separator to avoid namespace collisions)
        - `workspace`: path to the agent's workspace
        - `role`: from workflow definition (controls tool access policy)
      - Create a cron job via OpenClaw for this agent:
        - Schedule: `*/15 * * * *` (stagger each agent by a few minutes to avoid thundering herd)
        - Session: `isolated`
        - Agent: the registered agent ID
        - Message: the polling prompt (see agent-cron.ts)
3. Optionally inject guidance into the main agent's AGENTS.md and TOOLS.md

**OpenClaw integration (gateway-api.ts):**

```typescript
// Primary path: HTTP API
async function createAgentCronJob(agentId: string, workflowId: string, schedule: string) {
    try {
        const res = await fetch("http://127.0.0.1:18789/tools/invoke", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "cron",
                action: "add",
                payload: {
                    name: `${workflowId}_${agentId}_poll`,
                    cron: schedule,
                    sessionTarget: "isolated",
                    agentId: agentId,
                    payload: {
                        kind: "agentTurn",
                        message: buildPollingPrompt(workflowId, agentId),
                    },
                }
            })
        });
        return await res.json();
    } catch {
        // Fallback: CLI
        return execSync(`openclaw cron add --name "${workflowId}_${agentId}_poll" --cron "${schedule}" --session isolated --agent ${agentId} --message "${buildPollingPrompt(workflowId, agentId)}"`);
    }
}
```

**What it must NOT do:**
- Install anything from npm (the tool is linked via `npm link` from the cloned repo)
- Require Docker or any external services
- Modify OpenClaw internals — only use its public config and API

**Output:**
```
✓ Initialized database
✓ Installed workflow: feature-dev (7 agents)
✓ Installed workflow: bug-fix (6 agents)
✓ Installed workflow: security-audit (7 agents)
✓ Created 20 cron jobs
```

---

### `uninstall [--force]`

**Purpose:** Complete teardown. Reverse everything `install` did.

**What it must do (in order):**

1. Remove all cron jobs created by this tool (match by naming convention `<workflow-id>_<agent-id>_poll`)
2. Remove all agent entries from `~/.openclaw/openclaw.json` that were added by install
3. Delete all agent workspace directories under `~/.openclaw/workspaces/workflows/`
4. Delete the SQLite database file
5. Remove any injected guidance from the main agent's AGENTS.md / TOOLS.md
6. Remove the tool's data directory (`~/.openclaw/<tool-name>/`)

**The `--force` flag:** Proceeds even if some cleanup steps fail (e.g., a cron job was already manually deleted). Without `--force`, halt on first error.

**Output:**
```
✓ Removed 20 cron jobs
✓ Removed 20 agents from openclaw.json
✓ Deleted workflow workspaces
✓ Deleted database
✓ Cleanup complete
```

---

### `workflow list`

**Purpose:** Show all available workflow definitions.

**What it must do:**
1. Read all workflow YAML files from the `workflows/` directory
2. Parse each one and display: ID, name, number of agents, number of steps

**Output:**
```
Available workflows:
  feature-dev     Feature Development    7 agents, 7 steps
  bug-fix         Bug Fix               6 agents, 6 steps
  security-audit  Security Audit        7 agents, 7 steps
```

---

### `workflow install <id>`

**Purpose:** Install a single workflow (subset of full `install`).

**What it must do:**
1. Parse the specified workflow YAML
2. Create agent workspaces for that workflow only
3. Register agents in openclaw.json
4. Create cron jobs for those agents
5. Log the step to the events table

---

### `workflow uninstall <id>`

**Purpose:** Remove a single workflow.

**What it must do:**
1. Remove cron jobs for that workflow's agents
2. Remove agent entries from openclaw.json
3. Delete workspace directories for that workflow
4. Delete all run/step/story records for that workflow from SQLite

---

### `workflow run <workflow-id> <task>`

**Purpose:** Start a new workflow execution.

**What it must do:**

1. Look up the workflow definition by ID
2. Generate a run UUID
3. Insert a `runs` row with status `running`
4. For each step in the workflow definition (in order):
   - Generate a step UUID
   - Insert a `steps` row with:
     - `status`: `ready` for the first step, `pending` for all others
     - `agent_id`: resolved from the workflow definition (`<workflow-id>_<agent-id>`)
     - `input`: the raw input template (variables like `{{task}}` are NOT resolved yet — that happens at claim time)
     - `max_retries`: from the step definition or default (2)
5. Insert an event: `run.created`
6. Print the run ID and status

**Output:**
```
Run: a1fdf573
Workflow: feature-dev
Task: Add user authentication with OAuth
Status: running
Steps: 7 (first step ready for pickup)
```

**Important:** This does NOT trigger any agent. Agents discover work on their next cron poll. The run just sits in the database with step 1 marked `ready` until an agent claims it.

---

### `workflow status <query>`

**Purpose:** Check the status of a run by searching the task description.

**What it must do:**
1. Search `runs` table where `task LIKE %query%` (most recent first)
2. For the matched run, fetch all steps ordered by `created_at`
3. For any loop steps, fetch associated stories
4. Display the result

**Output:**
```
Run: a1fdf573
Workflow: feature-dev
Task: Add user authentication with OAuth
Status: running

Steps:
  [done   ] plan (planner)
  [done   ] setup (setup)
  [running] implement (developer)  Stories: 3/7 done
  [pending] verify (verifier)
  [pending] test (tester)
  [pending] pr (developer)
  [pending] review (reviewer)
```

---

### `workflow runs`

**Purpose:** List all runs across all workflows.

**What it must do:**
1. Query all runs ordered by `created_at DESC`
2. For each run, show: ID (short), workflow, task (truncated), status, age

**Output:**
```
ID        Workflow        Task                          Status    Age
a1fdf573  feature-dev     Add user authentication...    running   2h ago
b3e8c901  bug-fix         Fix login crash on iOS...     done      1d ago
c7f2a445  security-audit  Audit payments module...      failed    3d ago
```

---

### `workflow resume <run-id>`

**Purpose:** Resume a failed run from the point of failure.

**What it must do:**
1. Find the run by ID (accept partial ID match)
2. Verify the run status is `failed`
3. Find the failed step
4. Reset that step's status to `ready`, reset `retry_count` to 0
5. Set the run status back to `running`
6. Insert an event: `run.resumed`

---

### `workflow stop <run-id>`

**Purpose:** Cancel a running workflow.

**What it must do:**
1. Find the run by ID
2. Set run status to `stopped`
3. Set any `running` or `ready` steps to `stopped`
4. Insert an event: `run.stopped`

---

### `step claim --workflow <id> --agent <id>`

**Purpose:** Called by agents during cron sessions. Checks if there is work for this agent.

**What it must do:**
1. Query for a step where:
   - `agent_id` matches the provided agent ID
   - `status` is `ready`
   - The parent run's `workflow` matches and `status` is `running`
2. If no step found: print `NO_WORK` and exit
3. If step found:
   - Set step status to `running`
   - Set `claimed_at` to now
   - Resolve template variables in the input:
     - `{{task}}` → the run's task description
     - `{{key_name}}` → from previous steps' output (lowercased KEY names)
     - `{{verify_feedback}}` → from verifier's ISSUES output (if retry)
   - Insert an event: `step.claimed`
   - Print the resolved input for the agent to execute

**Output (no work):**
```
NO_WORK
```

**Output (work found):**
```
STEP_ID: <uuid>
WORKFLOW: feature-dev
STEP: implement
---
<resolved input template with all variables filled in>
```

**Critical detail:** The agent reads this output, does the work, then calls `step complete` or `step fail`. The step ID is included so the agent can reference it.

---

### `step complete --step <uuid>`

**Purpose:** Called by agents to report successful completion. Output is piped via stdin.

**What it must do:**
1. Read output from stdin (the agent pipes KEY: value pairs)
2. Find the step by UUID
3. Set step status to `done`
4. Store the output
5. Set `completed_at` to now
6. Insert an event: `step.completed`
7. **Advance the pipeline** (this is the critical part):
   - Parse KEY: value pairs from the output and store them
   - Check if the output contains `STORIES_JSON:` — if so, create story records for the next loop step
   - Find the next `pending` step in this run and set it to `ready`
   - If no more pending steps exist, check if all steps are `done`:
     - If yes: set run status to `done`, insert event `run.completed`
     - If any are `failed`: set run status to `failed`
8. Print confirmation

**Pipeline advancement logic (pipeline.ts):**

```typescript
function advancePipeline(runId: string): void {
    const steps = db.prepare(
        "SELECT * FROM steps WHERE run_id = ? ORDER BY created_at ASC"
    ).all(runId);

    const allDone = steps.every(s => s.status === "done");
    const anyFailed = steps.some(s => s.status === "failed");
    const nextPending = steps.find(s => s.status === "pending");

    if (allDone) {
        db.prepare("UPDATE runs SET status = 'done', completed_at = datetime('now') WHERE id = ?")
            .run(runId);
        insertEvent(runId, null, "run.completed");
    } else if (anyFailed && !nextPending) {
        db.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(runId);
        insertEvent(runId, null, "run.failed");
    } else if (nextPending) {
        db.prepare("UPDATE steps SET status = 'ready' WHERE id = ?")
            .run(nextPending.id);
        insertEvent(runId, nextPending.id, "step.ready");
    }
}
```

---

### `step fail --step <uuid>`

**Purpose:** Called by agents to report failure. Output is piped via stdin.

**What it must do:**
1. Read output from stdin (includes ISSUES: for retry feedback)
2. Find the step by UUID
3. Increment `retry_count`
4. If `retry_count < max_retries`:
   - Check if the workflow definition has an `on_fail.retry_step` configured
   - If yes: set THAT step back to `ready` with `{{verify_feedback}}` populated from the ISSUES output
   - If no: set the current step back to `ready` for self-retry
   - Insert event: `step.retrying`
5. If `retry_count >= max_retries`:
   - Set step status to `failed`
   - Check `on_fail.on_exhausted`:
     - If `escalate_to: human`: set run status to `failed`, insert event `step.escalated`
   - Insert event: `step.failed`

---

### `step stories --step <uuid>`

**Purpose:** For loop steps, list the stories so the agent knows what to work on.

**What it must do:**
1. Query stories for the given step ID
2. Return them as a formatted list with status

**Output:**
```
Stories for step implement (run a1fdf573):
  [done   ] S-1: Create database schema
  [done   ] S-2: Add user registration endpoint
  [running] S-3: Add login endpoint
  [pending] S-4: Add OAuth flow
  [pending] S-5: Add session management
```

---

### `dashboard`

**Purpose:** Start a local HTTP server that serves a monitoring UI.

**What it must do:**
1. Start an HTTP server on port 3333
2. Serve a single-page HTML/JS dashboard that:
   - Polls the SQLite database (via a small API layer)
   - Shows all runs with their step progress
   - Shows an activity timeline from the events table
   - Auto-refreshes every few seconds
3. Daemonize (run in background)

**Sub-commands:**
- `dashboard` or `dashboard start` — start the server
- `dashboard stop` — stop the background process
- `dashboard status` — check if running

---

### `logs [<lines>]`

**Purpose:** Show recent activity from the events table.

**What it must do:**
1. Query the events table ordered by `created_at DESC`
2. Limit to `<lines>` (default 50)
3. Format each event with timestamp, type, run ID, step name

---

## Prompt Builders (agent-cron.ts)

These generate the prompts that cron jobs send to agents.

### Polling Prompt (~250 chars, cheap)

```typescript
export function buildPollingPrompt(workflowId: string, agentId: string): string {
    return `Run: <tool-name> step claim --workflow ${workflowId} --agent ${agentId}
If the output is NO_WORK, reply with HEARTBEAT_OK and stop immediately.
If work is returned, execute the task described, then report results.`;
}
```

### Work Prompt (loaded only when there IS work — included in step claim output)

The step claim command output includes the full instructions the agent needs. This is NOT part of the cron prompt — it's returned dynamically when work is found. It includes:

- The resolved input template (with all `{{variables}}` filled)
- Instructions to call `step complete` or `step fail` with output via stdin
- Critical rules (don't skip steps, always report status, etc.)

---

## Workflow Definition Format (workflow-spec.ts)

Workflows are defined in YAML. The parser reads these and validates them.

```yaml
id: feature-dev
name: Feature Development
version: 1
description: Decomposes feature requests into stories with implementation and verification.

agents:
  - id: planner
    name: Planner
    role: analysis
    description: Decomposes tasks into implementable stories.
    workspace:
      files:
        AGENTS.md: agents/planner/AGENTS.md
        SOUL.md: agents/planner/SOUL.md

  - id: developer
    name: Developer
    role: coding
    description: Implements stories.
    timeoutSeconds: 1800
    workspace:
      files:
        AGENTS.md: agents/developer/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: |
      Task: {{task}}
      Decompose into implementable stories.
      Reply with STATUS: done and STORIES_JSON: [...]
    expects: "STATUS: done"

  - id: implement
    agent: developer
    type: loop
    loop:
      over: stories
      completion: all_done
    input: |
      Implement story: {{story_title}}
      Acceptance criteria: {{story_criteria}}
      Reply with STATUS: done
    expects: "STATUS: done"

  - id: verify
    agent: verifier
    input: |
      Verify the implementation against acceptance criteria.
      Reply STATUS: done or STATUS: retry with ISSUES: ...
    expects: "STATUS: done"
    on_fail:
      retry_step: implement
      max_retries: 3
      on_exhausted:
        escalate_to: human
```

---

## Types (types.ts)

```typescript
export interface WorkflowSpec {
    id: string;
    name: string;
    version: number;
    description: string;
    agents: WorkflowAgent[];
    steps: WorkflowStep[];
    polling?: PollingConfig;
}

export interface WorkflowAgent {
    id: string;
    name: string;
    role: "coding" | "analysis" | "review";
    description: string;
    timeoutSeconds?: number;
    pollingModel?: string;
    workspace: {
        baseDir?: string;
        files: Record<string, string>;
    };
}

export interface WorkflowStep {
    id: string;
    agent: string;              // references WorkflowAgent.id
    input: string;              // template with {{variables}}
    expects: string;            // string that output must contain
    type?: "loop";
    loop?: {
        over: "stories";
        completion: "all_done";
    };
    max_retries?: number;
    on_fail?: {
        retry_step?: string;    // step ID to retry
        max_retries?: number;
        on_exhausted?: {
            escalate_to: "human";
        };
    };
}

export interface PollingConfig {
    model?: string;
    timeoutSeconds?: number;
}

// Database row types
export interface Run {
    id: string;
    workflow: string;
    task: string;
    status: "running" | "done" | "failed" | "stopped";
    created_at: string;
    completed_at: string | null;
}

export interface Step {
    id: string;
    run_id: string;
    step_name: string;
    agent_id: string;
    status: "pending" | "ready" | "running" | "done" | "failed" | "stopped";
    input: string | null;
    output: string | null;
    retry_count: number;
    max_retries: number;
    created_at: string;
    claimed_at: string | null;
    completed_at: string | null;
}

export interface Story {
    id: string;
    step_id: string;
    title: string;
    description: string | null;
    acceptance_criteria: string | null;
    status: "pending" | "running" | "done" | "failed";
    retry_count: number;
    max_retries: number;
    output: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface Event {
    id: number;
    run_id: string | null;
    step_id: string | null;
    event_type: string;
    details: string | null;
    created_at: string;
}
```

---

## CLI Entry Point (cli.ts)

Route commands based on argv. Keep it simple — no heavy framework needed.

```typescript
#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

switch (command) {
    case "install":
        return import("./commands/install").then(m => m.default(args.slice(1)));

    case "uninstall":
        return import("./commands/uninstall").then(m => m.default(args.slice(1)));

    case "workflow":
        switch (subcommand) {
            case "run":     return import("./commands/workflow/run").then(m => m.default(args.slice(2)));
            case "status":  return import("./commands/workflow/status").then(m => m.default(args.slice(2)));
            case "list":    return import("./commands/workflow/list").then(m => m.default(args.slice(2)));
            case "runs":    return import("./commands/workflow/runs").then(m => m.default(args.slice(2)));
            case "resume":  return import("./commands/workflow/resume").then(m => m.default(args.slice(2)));
            case "stop":    return import("./commands/workflow/stop").then(m => m.default(args.slice(2)));
            case "install": return import("./commands/workflow/install").then(m => m.default(args.slice(2)));
            case "uninstall": return import("./commands/workflow/uninstall").then(m => m.default(args.slice(2)));
            default:
                console.error(`Unknown workflow command: ${subcommand}`);
                process.exit(1);
        }

    case "step":
        switch (subcommand) {
            case "claim":    return import("./commands/step/claim").then(m => m.default(args.slice(2)));
            case "complete": return import("./commands/step/complete").then(m => m.default(args.slice(2)));
            case "fail":     return import("./commands/step/fail").then(m => m.default(args.slice(2)));
            case "stories":  return import("./commands/step/stories").then(m => m.default(args.slice(2)));
            default:
                console.error(`Unknown step command: ${subcommand}`);
                process.exit(1);
        }

    case "dashboard":
        return import("./commands/dashboard").then(m => m.default(args.slice(1)));

    case "logs":
        return import("./commands/logs").then(m => m.default(args.slice(1)));

    case "version":
        const pkg = require("../package.json");
        console.log(pkg.version);
        break;

    default:
        console.log(`Usage: <tool-name> <command> [options]

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
  version                     Show version`);
}
```

---

## Build Configuration

**package.json:**
```json
{
    "name": "<tool-name>",
    "version": "0.1.0",
    "bin": { "<tool-name>": "dist/cli.js" },
    "scripts": {
        "build": "tsc",
        "dev": "tsx src/cli.ts"
    },
    "engines": { "node": ">=22" },
    "devDependencies": {
        "typescript": "^5.x",
        "tsx": "^4.x"
    },
    "dependencies": {
        "yaml": "^2.x"
    }
}
```

**tsconfig.json:**
```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "Node16",
        "moduleResolution": "Node16",
        "outDir": "dist",
        "rootDir": "src",
        "strict": true,
        "esModuleInterop": true,
        "declaration": true
    },
    "include": ["src/**/*"]
}
```

**After build:** `npm link` makes the CLI globally available.

---

## Implementation Order (suggested)

1. **types.ts** — define all interfaces first
2. **db.ts** — schema + init + basic CRUD helpers
3. **workflow-spec.ts** — YAML parser (just reads and validates workflow files)
4. **cli.ts** — entry point with command routing (stub all handlers)
5. **workflow list** — simplest command, proves YAML parsing works
6. **workflow run** — creates run + step records in DB
7. **workflow status** — reads DB, proves the data model works
8. **workflow runs** — list view
9. **step claim** — the agent API, core of the system
10. **step complete** — with pipeline advancement logic
11. **step fail** — with retry logic
12. **pipeline.ts** — extract and harden the advancement logic
13. **install** — wires into OpenClaw (agents + crons)
14. **uninstall** — tears it down
15. **workflow resume / stop** — run lifecycle management
16. **agent-cron.ts** — prompt builders
17. **dashboard** — last, since everything else needs to work first
18. **logs** — reads events table

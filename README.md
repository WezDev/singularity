# @wezdev/singularity

Programmatic TypeScript SDK for managing [OpenClaw](https://github.com/openclaw) instances — configuration, agents, cron jobs, sessions, skills, and state.

Build dashboards, CLIs, and automation tools on top of OpenClaw with full type safety.

## Requirements

- Node.js 22+
- ESM (set `"type": "module"` in your `package.json`)

## Installation

```bash
npm install @wezdev/singularity
```

## Quick Start

```typescript
import { OpenClawSDK } from '@wezdev/singularity';

const sdk = new OpenClawSDK();

// Read config
const config = await sdk.config.read();

// List agents
const agents = await sdk.agents.list();

// Check gateway health
const health = await sdk.gateway.health();

// Clean up when done
sdk.close();
```

## Constructor Options

```typescript
const sdk = new OpenClawSDK({
  configPath: '~/.openclaw/openclaw.json', // Default config location
  gatewayUrl: 'http://127.0.0.1:18789',    // Gateway API URL
  gatewayToken: 'my-secret-token',          // Optional auth token
  dbPath: '~/.openclaw/horizon/state.db',   // State database path
});
```

All options are optional and have sensible defaults.

## Modules

The SDK is organized into focused modules. You can import from the main entry point or from individual subpaths:

```typescript
// Everything from the main entry
import { OpenClawSDK, AgentManager, GatewayClient } from '@wezdev/singularity';

// Or import specific modules
import { readConfig, writeConfig } from '@wezdev/singularity/config';
import { AgentManager } from '@wezdev/singularity/agents';
import { GatewayClient } from '@wezdev/singularity/gateway';
import { CronManager } from '@wezdev/singularity/cron';
import { SessionsManager } from '@wezdev/singularity/sessions';
import { SkillsManager } from '@wezdev/singularity/skills';
import { StateDatabase } from '@wezdev/singularity/database';
```

---

## Configuration

The `sdk.config` object provides read/write access to OpenClaw's JSON5 config file. All writes are atomic (backup → temp file → rename) to prevent corruption.

### Reading and Writing

```typescript
// Read with $include resolution and ${VAR} env substitution
const config = await sdk.config.read();

// Read raw (preserves $include directives and ${VAR} literals)
const raw = await sdk.config.readRaw();

// Write full config (creates a backup first)
await sdk.config.write(config);

// Patch (deep merge)
await sdk.config.patch({ identity: { name: 'Nova' } });

// Create a manual backup
const backupPath = await sdk.config.backup();
```

### Dot-path Access

```typescript
// Get a nested value
const model = await sdk.config.get('agents.defaults.model.primary');

// Set a nested value (creates intermediate objects as needed)
await sdk.config.set('agents.defaults.model.primary', 'claude-sonnet-4-6');
```

### Validation

```typescript
const result = await sdk.config.validate();
if (!result.valid) {
  for (const err of result.errors) {
    console.error(`${err.path}: ${err.message}`);
  }
}
```

Validation checks include:
- Zod schema validation on all fields
- No duplicate agent IDs
- At most one default agent
- Agent bindings reference existing agents

### Standalone Config Functions

These can be used without instantiating the SDK:

```typescript
import {
  readConfig,
  readConfigRaw,
  writeConfig,
  patchConfig,
  backupConfig,
  validateConfig,
  assertConfigValid,
  deepMerge,
  getConfigValue,
  setConfigValue,
} from '@wezdev/singularity';

const config = await readConfig();
const result = validateConfig(config);
assertConfigValid(config); // throws ConfigValidationError if invalid
```

### Config Features

- **JSON5 format** — comments, trailing commas, unquoted keys
- **`$include` directives** — split config across files:
  ```json5
  { agents: { $include: "./agents.json5" } }
  ```
- **Environment variable substitution** — `${VAR_NAME}` is replaced with `process.env.VAR_NAME`
- **Escaped env vars** — `$${VAR}` produces a literal `${VAR}` in the output

---

## Agents

Manage agent definitions in the config and their filesystem workspaces.

```typescript
// List all agents
const agents = await sdk.agents.list();

// Get a specific agent
const agent = await sdk.agents.get('planner');

// Create a new agent (also initializes workspace with template files)
await sdk.agents.create({
  id: 'planner',
  name: 'Planner',
  role: 'task-planning',
  description: 'Plans and breaks down complex tasks',
});

// Create without initializing workspace
await sdk.agents.create(
  { id: 'minimal', name: 'Minimal' },
  { initWorkspace: false },
);

// Update an agent
await sdk.agents.update('planner', { name: 'Task Planner' });

// Set as default agent
await sdk.agents.setDefault('planner');

// Delete an agent
await sdk.agents.delete('planner');

// Delete agent and remove workspace directory
await sdk.agents.delete('planner', { removeWorkspace: true });
```

Agent IDs must contain only letters, numbers, hyphens, and underscores.

### Agent Workspaces

Each agent has a workspace directory at `~/.openclaw/agents/<id>/` containing persona and instruction files.

```typescript
const ws = sdk.agents.workspace('planner');

// Initialize with template files (AGENTS.md, SOUL.md, IDENTITY.md)
await ws.init();

// Read/write files
const soul = await ws.readFile('SOUL.md');
await ws.writeFile('CUSTOM.md', '# Custom instructions');

// List all files
const files = await ws.listFiles();

// Check existence
const exists = await ws.exists();

// Remove workspace
await ws.destroy();
```

---

## Gateway

HTTP client for the OpenClaw Gateway API (default: `http://127.0.0.1:18789`).

```typescript
// Check if Gateway is running
const reachable = await sdk.gateway.isReachable();

// Get health status
const health = await sdk.gateway.health();
// → { status: 'ok', version: '...', uptime: 12345, agents: 3 }

// Raw RPC call
const result = await sdk.gateway.rpc<MyType>('my.method', { key: 'value' });

// Config operations via Gateway (rate-limited: 3 req/60s)
await sdk.gateway.configApply(fullConfig);
await sdk.gateway.configPatch({ identity: { name: 'Nova' } });

// Tool invocation
await sdk.gateway.toolInvoke('my-tool', 'run', { param: 'value' });

// Session management via Gateway
const sessions = await sdk.gateway.sessionsList();
await sdk.gateway.sessionsKill('session-id');
```

### Error Handling

```typescript
import { GatewayError } from '@wezdev/singularity';

try {
  await sdk.gateway.rpc('some.method');
} catch (err) {
  if (err instanceof GatewayError) {
    console.error(err.message);      // Human-readable message
    console.error(err.statusCode);   // HTTP status or RPC error code
    console.error(err.responseBody); // Raw response body
  }
}
```

---

## Cron Jobs

Manage scheduled agent tasks. Tries the Gateway HTTP API first, falls back to the `openclaw cron` CLI.

```typescript
// List all cron jobs
const jobs = await sdk.cron.list();

// Create a job
await sdk.cron.create({
  name: 'daily-summary',
  schedule: { kind: 'cron', expr: '0 8 * * *' },
  agentId: 'planner',
  sessionTarget: 'isolated',
  payload: {
    kind: 'agentTurn',
    message: 'Summarize what happened yesterday',
    timeoutSeconds: 300,
  },
});

// Pause / resume
await sdk.cron.pause('daily-summary');
await sdk.cron.resume('daily-summary');

// Delete
await sdk.cron.delete('daily-summary');
```

---

## Sessions

Query and manage active agent sessions.

```typescript
// List all sessions
const sessions = await sdk.sessions.list();

// Filter by agent or active status
const active = await sdk.sessions.list({ agentId: 'planner', active: true });

// Get a specific session
const session = await sdk.sessions.get('session-id');

// Count active sessions
const count = await sdk.sessions.countActive();
const agentCount = await sdk.sessions.countActive('planner');

// Terminate a session
await sdk.sessions.kill('session-id');
```

### Session Object

```typescript
interface Session {
  id: string;
  agentId: string;
  channel?: string;       // 'telegram', 'discord', 'web', etc.
  peerId?: string;        // Conversation identifier
  startedAt: string;      // ISO timestamp
  lastActiveAt?: string;
  messageCount?: number;
  tokensUsed?: number;
  active: boolean;
}
```

---

## Skills

Manage skill packages (global or per-agent).

```typescript
// List global skills
const skills = await sdk.skills.list();

// List skills for a specific agent
const agentSkills = await sdk.skills.listForAgent('planner');

// Read skill content
const content = await sdk.skills.read('my-skill');
// → { id, skillMd, files: { 'helper.js': '...' } }

// Install a global skill
await sdk.skills.install('my-skill', {
  skillMd: '# My Skill\nInstructions for the agent...',
  additionalFiles: { 'helper.js': 'console.log("hello")' },
});

// Install a skill for a specific agent
await sdk.skills.installForAgent('planner', 'my-skill', {
  skillMd: '# Agent-Specific Skill\n...',
});

// Check existence
const exists = await sdk.skills.exists('my-skill');

// Uninstall
await sdk.skills.uninstall('my-skill');
await sdk.skills.uninstallForAgent('planner', 'my-skill');
```

### Skill Locations

- Global skills: `~/.openclaw/skills/<id>/`
- Per-agent skills: `~/.openclaw/agents/<agentId>/skills/<id>/`

---

## State Database

SQLite-backed storage for run history, usage tracking, and activity logs. The database is lazily initialized on first access to `sdk.db`.

### Runs

Track agent/job executions:

```typescript
// Insert a run
sdk.db.runs.insert({
  id: 'run-001',
  jobId: 'daily-summary',
  jobTitle: 'Daily Summary',
  agentId: 'planner',
  agentName: 'Planner',
  startedAt: new Date().toISOString(),
  completedAt: null,
  durationSeconds: null,
  status: 'running',
  tokensUsed: null,
  costUsd: null,
  error: null,
});

// Mark as completed
sdk.db.runs.complete('run-001', {
  status: 'success',
  durationSeconds: 42,
  tokensUsed: 1500,
  costUsd: 0.003,
});

// Query runs
const run = sdk.db.runs.get('run-001');
const recent = sdk.db.runs.listRecent(10);
const jobRuns = sdk.db.runs.listForJob('daily-summary');
const agentRuns = sdk.db.runs.listForAgent('planner');
```

### Usage

Daily token/cost tracking per agent (aggregates on upsert):

```typescript
// Record usage (aggregates if same date+agent already exists)
sdk.db.usage.upsert({
  id: 'usage-001',
  date: '2026-02-28',
  agentId: 'planner',
  agentName: 'Planner',
  model: 'claude-sonnet-4-6',
  tokensInput: 500,
  tokensOutput: 1000,
  tokensTotal: 1500,
  costUsd: 0.003,
});

// Query usage
const range = sdk.db.usage.getByDateRange('2026-02-01', '2026-02-28');
const agentUsage = sdk.db.usage.getByAgent('planner', '2026-02-01', '2026-02-28');
const totals = sdk.db.usage.getTotals('2026-02-01', '2026-02-28');
// → { tokensTotal: 150000, costUsd: 1.25 }
const perAgent = sdk.db.usage.getPerAgentTotals('2026-02-01', '2026-02-28');
// → [{ agentId, agentName, model, tokensTotal, costUsd, runCount }]
```

### Activity

Event log for dashboards and auditing:

```typescript
// Log an event
sdk.db.activity.insert({
  id: 'act-001',
  agentId: 'planner',
  agentName: 'Planner',
  eventType: 'task.completed',
  summary: 'Completed daily planning task',
  detail: 'Generated 5 sub-tasks from the backlog',
  timestamp: new Date().toISOString(),
  tokensUsed: 1500,
  costUsd: 0.003,
  rawLog: null,
});

// Query activity
const recent = sdk.db.activity.listRecent(50);
const agentActivity = sdk.db.activity.listForAgent('planner');
const byType = sdk.db.activity.listByType('task.completed');
const results = sdk.db.activity.search('planning');
```

---

## Filesystem Paths

Canonical path helpers for the OpenClaw directory structure:

```typescript
import { paths, expandTilde, resolvePath } from '@wezdev/singularity';

paths.home              // ~/.openclaw
paths.config            // ~/.openclaw/openclaw.json
paths.agent('planner')  // ~/.openclaw/agents/planner
paths.agentFile('planner', 'SOUL.md')  // ~/.openclaw/agents/planner/SOUL.md
paths.agentMemory('planner')           // ~/.openclaw/agents/planner/memory
paths.agentSessions('planner')         // ~/.openclaw/agents/planner/sessions
paths.skills            // ~/.openclaw/skills
paths.skill('my-skill') // ~/.openclaw/skills/my-skill
paths.cron              // ~/.openclaw/cron
paths.cronJobs          // ~/.openclaw/cron/jobs.json
paths.credentials       // ~/.openclaw/credentials
paths.workspaces        // ~/.openclaw/workspaces

// Path utilities
expandTilde('~/path')          // Expands ~ to home directory
resolvePath('$HOME/path')      // Expands ~, $HOME, and $OPENCLAW_HOME
```

Override the base directory with the `OPENCLAW_HOME` environment variable.

---

## Convenience Accessors

The SDK provides shorthand accessors for common config operations:

### Identity

```typescript
const identity = await sdk.identity.get();
// → { name: 'Nova', emoji: '🤖', theme: 'dark' }

await sdk.identity.set({ name: 'Atlas', emoji: '🌍' });
```

### Channels

```typescript
const channels = await sdk.channels.list();

await sdk.channels.configure('telegram', {
  enabled: true,
  botToken: process.env.TG_BOT_TOKEN,
});

await sdk.channels.disable('discord');
```

### Models

```typescript
const providers = await sdk.models.listProviders();

await sdk.models.addProvider('openrouter', {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_KEY,
  api: 'openai-completions',
  models: [{ id: 'anthropic/claude-sonnet-4-6', name: 'Sonnet 4.6' }],
});

await sdk.models.setDefault('anthropic/claude-sonnet-4-6');

await sdk.models.removeProvider('openrouter');
```

---

## Lifecycle

Always close the SDK when you're done to release database connections:

```typescript
const sdk = new OpenClawSDK();
try {
  // ... your work
} finally {
  sdk.close();
}
```

---

## Development

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm run test       # Run tests (vitest, watch mode)
npm run test:run   # Run tests once
npm run lint       # Type check
npm run clean      # Remove dist/
```

## License

MIT

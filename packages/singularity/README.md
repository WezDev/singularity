# @wezdev/singularity

TypeScript SDK for the Singularity platform. Provides programmatic access to agents, cron jobs, workflow state, usage tracking, and configuration.

Designed for server-side use in Node.js applications (e.g. a Next.js dashboard).

## Requirements

- Node.js >= 22

## Installation

```bash
pnpm add @wezdev/singularity
```

## Quick Start

```typescript
import { createSingularitySDK } from "@wezdev/singularity";

const sdk = createSingularitySDK();

// List agents
const agents = await sdk.agents.list();

// Create a cron job
await sdk.cron.create({
  name: "nightly-check",
  schedule: { kind: "cron", cron: "0 2 * * *" },
  payload: { kind: "agentTurn", message: "Run nightly checks" },
  agentId: "my-agent",
});

// Query workflow runs
const runs = await sdk.database.getRuns({ status: "running", limit: 10 });

// Get dashboard stats
const stats = await sdk.database.getStats();
```

## Configuration

All config options have sensible defaults:

```typescript
const sdk = createSingularitySDK({
  gatewayUrl: "http://127.0.0.1:18789",        // Singularity gateway
  dbPath: "~/.singularity/state.db",            // SQLite state DB
  configPath: "~/.singularity/config.json",     // Config file
  cronStorePath: "~/.singularity/cron/jobs.json", // Cron job store
  skillsDir: "~/.singularity/workspace/skills", // Skills directory
});
```

## Modules

| Module | Description |
|--------|-------------|
| `sdk.agents` | List, create, update, and delete agents |
| `sdk.cron` | Manage cron jobs (HTTP primary, CLI fallback) |
| `sdk.database` | Query runs, steps, stories, and events from the SQLite state DB |
| `sdk.activity` | Enriched event log with run/step context |
| `sdk.usage` | Token usage summaries by model or agent with cost estimates |
| `sdk.config` | Read and update the JSON config |
| `sdk.skills` | Manage agent skills on the filesystem |

## Transport Layer

The SDK uses a dual-transport strategy for operations that require the gateway:

- **HTTP** — primary transport, communicates with the gateway API
- **CLI** — fallback transport, shells out to the `singularity` CLI

If the gateway is unreachable, operations automatically fall back to the CLI. Database and filesystem operations work directly without either transport.

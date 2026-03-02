// SDK Configuration

export interface SDKConfig {
    gatewayUrl?: string;
    authToken?: string;
    cliBinary?: string;
    dbPath?: string;
    configPath?: string;
    cronStorePath?: string;
    skillsDir?: string;
    agentsBaseDir?: string;
    workflowsDir?: string;
}

export interface ResolvedSDKConfig {
    gatewayUrl: string;
    authToken?: string;
    cliBinary: string;
    dbPath: string;
    configPath: string;
    cronStorePath: string;
    skillsDir: string;
    agentsBaseDir: string;
    workflowsDir: string;
}

// Agents

export interface Agent {
    id: string;
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
    isDefault?: boolean;
}

export interface CreateAgentParams {
    id: string;
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
}

export interface UpdateAgentParams {
    name?: string;
    model?: string;
    workspace?: string;
    role?: string;
    description?: string;
}

// Cron

export interface CronJob {
    jobId: string;
    name: string;
    enabled: boolean;
    schedule: CronSchedule;
    payload: CronPayload;
    agentId?: string;
    delivery?: CronDelivery;
    lastRun?: CronRunSummary;
    nextRunAt?: string;
}

export interface CronSchedule {
    kind: "cron" | "at" | "every";
    cron?: string;
    at?: string;
    every?: number;
    timezone?: string;
    staggerMs?: number;
}

export interface CronPayload {
    kind: "agentTurn" | "systemEvent";
    message?: string;
    model?: string;
    thinkingLevel?: string;
}

export interface CronDelivery {
    mode: "announce" | "webhook" | "none";
    channel?: string;
    to?: string;
    bestEffort?: boolean;
}

export interface CronRunSummary {
    status: "ok" | "error" | "skipped";
    startedAt: string;
    endedAt?: string;
    error?: string;
}

export interface CreateCronParams {
    name: string;
    schedule: CronSchedule;
    payload: CronPayload;
    agentId?: string;
    delivery?: CronDelivery;
    deleteAfterRun?: boolean;
}

export interface UpdateCronParams {
    name?: string;
    enabled?: boolean;
    schedule?: Partial<CronSchedule>;
    payload?: Partial<CronPayload>;
    agentId?: string;
    delivery?: CronDelivery;
}

// Database / Runs

export interface RunsQuery {
    workflow?: string;
    status?: Run["status"];
    search?: string;
    limit?: number;
    offset?: number;
}

export interface EventsQuery {
    runId?: string;
    stepId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    limit: number;
    offset: number;
}

export interface Run {
    id: string;
    workflow: string;
    task: string;
    status: "ready" | "scheduled" | "done" | "failed" | "stopped";
    runSpec: string | null;
    createdAt: string;
    completedAt: string | null;
    scheduledAt: string | null;
}

export interface RunDetail extends Run {
    steps: Step[];
    progress: {
        total: number;
        completed: number;
        failed: number;
        running: number;
        pending: number;
    };
}

export interface Step {
    id: string;
    runId: string;
    stepName: string;
    agentId: string;
    status: "pending" | "ready" | "running" | "done" | "failed" | "stopped";
    input: string | null;
    output: string | null;
    retryCount: number;
    maxRetries: number;
    createdAt: string;
    claimedAt: string | null;
    completedAt: string | null;
}

export interface StepDetail extends Step {
    stories?: Story[];
    parsedOutput?: Record<string, string>;
}

export interface Story {
    id: string;
    stepId: string;
    title: string;
    description: string | null;
    acceptanceCriteria: string[] | null;
    status: "pending" | "running" | "done" | "failed";
    retryCount: number;
    maxRetries: number;
    output: string | null;
    createdAt: string;
    completedAt: string | null;
}

export interface Event {
    id: number;
    runId: string | null;
    stepId: string | null;
    eventType: string;
    details: Record<string, unknown> | null;
    createdAt: string;
}

export interface DashboardStats {
    totalRuns: number;
    activeRuns: number;
    completedRuns: number;
    failedRuns: number;
    totalSteps: number;
    avgStepsPerRun: number;
    runsLast24h: number;
    runsLast7d: number;
}

// Activity

export interface ActivityQuery {
    runId?: string;
    stepId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
}

export interface ActivityEvent extends Event {
    runTask?: string;
    stepName?: string;
    agentId?: string;
}

// Config

export interface SingularityConfig {
    agent?: {
        model?: string;
        [key: string]: unknown;
    };
    agents?: AgentConfigEntry[];
    channels?: Record<string, unknown>;
    cron?: {
        enabled?: boolean;
        store?: string;
        maxConcurrentRuns?: number;
        [key: string]: unknown;
    };
    gateway?: Record<string, unknown>;
    browser?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface AgentConfigEntry {
    id: string;
    workspace?: string;
    role?: string;
    model?: string;
    [key: string]: unknown;
}

// Skills

export interface Skill {
    id: string;
    path: string;
    type: "bundled" | "managed" | "workspace";
    hasSkillMd: boolean;
    description?: string;
    content?: string;
    scope: "global" | "agent";
    agentId?: string;
}

export interface CreateSkillParams {
    id: string;
    description: string;
    content: string;
    files?: Record<string, string>;
    target?: "global" | string[];
}

export interface UpdateSkillParams {
    description?: string;
    content?: string;
    files?: Record<string, string>;
    target?: "global" | string[];
}

// Usage

export interface UsageQuery {
    model?: string;
    agentId?: string;
    days?: number;
    from?: string;
    to?: string;
}

export interface UsageSummary {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    period: { from: string; to: string };
    sessionCount: number;
}

export interface UsageByModel {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    sessionCount: number;
}

export interface UsageByAgent {
    agentId: string;
    agentName?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    sessionCount: number;
}

// Workflows

export interface WorkflowRunDef {
    id: string;
    name: string;
    description: string;
    steps: WorkflowStepDef[];
}

export interface Workflow {
    id: string;
    name: string;
    version: number;
    description: string;
    agents: WorkflowAgentDef[];
    runs: WorkflowRunDef[];
}

export interface WorkflowAgentDef {
    id: string;
    name: string;
    role: string;
    description: string;
}

export interface WorkflowStepDef {
    id: string;
    agent: string;
    input: string;
    expects: string;
    type?: string;
    loop?: { over: string; completion: string };
    maxRetries?: number;
    onFail?: { retryStep?: string; maxRetries?: number; onExhausted?: { escalateTo: string } };
}

export interface CreateWorkflowParams {
    id: string;
    name: string;
    version?: number;
    description: string;
    agents: WorkflowAgentDef[];
    runs: WorkflowRunDef[];
}

export interface UpdateWorkflowParams {
    name?: string;
    description?: string;
    agents?: WorkflowAgentDef[];
    runs?: WorkflowRunDef[];
}

// Tasks (maps to runs/steps in the DB)

export interface CreateTaskParams {
    workflowId: string;
    task: string;
    runId?: string;
    scheduledAt?: string;
}

export interface UpdateTaskParams {
    status?: "ready" | "stopped";
}

export interface UpdateSubtaskParams {
    status?: "ready" | "stopped";
}

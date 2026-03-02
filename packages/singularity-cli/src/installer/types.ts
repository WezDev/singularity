export interface RunTemplate {
    id: string;
    name: string;
    description: string;
    steps: WorkflowStep[];
}

export interface WorkflowSpec {
    id: string;
    name: string;
    version: number;
    description: string;
    agents: WorkflowAgent[];
    runs: RunTemplate[];
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
    agent: string;
    input: string;
    expects: string;
    type?: "loop";
    loop?: {
        over: "stories";
        completion: "all_done";
    };
    max_retries?: number;
    on_fail?: {
        retry_step?: string;
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

// Database row types (snake_case to match DB)

export interface RunRow {
    id: string;
    workflow: string;
    task: string;
    status: "running" | "done" | "failed" | "stopped";
    run_spec: string | null;
    created_at: string;
    completed_at: string | null;
    scheduled_at: string | null;
}

export interface StepRow {
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

export interface StoryRow {
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

export interface EventRow {
    id: number;
    run_id: string | null;
    step_id: string | null;
    event_type: string;
    details: string | null;
    created_at: string;
}

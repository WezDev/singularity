/**
 * Canonical OpenClaw filesystem paths.
 * All paths resolve relative to ~/.openclaw/ unless OPENCLAW_HOME is set.
 */
export declare const paths: {
    /** Root OpenClaw directory */
    readonly home: string;
    /** Main config file (JSON5) */
    readonly config: string;
    /** Agent workspace directory */
    readonly agent: (id: string) => string;
    /** Agent workspace file */
    readonly agentFile: (id: string, filename: string) => string;
    /** Agent memory directory */
    readonly agentMemory: (id: string) => string;
    /** Agent sessions directory */
    readonly agentSessions: (id: string) => string;
    /** Workflow workspaces root */
    readonly workspaces: string;
    /** Specific workflow workspace */
    readonly workflowWorkspace: (id: string) => string;
    /** Skills directory */
    readonly skills: string;
    /** Specific skill directory */
    readonly skill: (id: string) => string;
    /** Cron directory */
    readonly cron: string;
    /** Cron jobs file */
    readonly cronJobs: string;
    /** Credentials directory */
    readonly credentials: string;
    /** Default main workspace */
    readonly workspace: string;
};
/**
 * Expand ~ to home directory in a path string.
 */
export declare function expandTilde(filepath: string): string;
/**
 * Resolve an OpenClaw path, expanding ~ and env vars.
 */
export declare function resolvePath(filepath: string): string;
//# sourceMappingURL=paths.d.ts.map
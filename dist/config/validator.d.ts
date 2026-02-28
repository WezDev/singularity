import type { OpenClawConfig } from './schema.js';
export interface ValidationError {
    /** Dot-path to the invalid field, e.g. "agents.list.0.id" */
    path: string;
    /** Human-readable error message */
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
/**
 * Validate an OpenClaw config against the schema.
 *
 * Returns structured errors with dot-paths. Does NOT throw.
 */
export declare function validateConfig(config: OpenClawConfig): ValidationResult;
/**
 * Validate and throw on first error. Useful for write guards.
 */
export declare function assertConfigValid(config: OpenClawConfig): void;
export declare function validateCronJob(job: unknown): ValidationResult;
export declare class ConfigValidationError extends Error {
    errors: ValidationError[];
    constructor(message: string, errors: ValidationError[]);
}
//# sourceMappingURL=validator.d.ts.map
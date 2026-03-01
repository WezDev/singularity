import type { SDKConfig } from "./types.js";
import { SingularitySDK } from "./client.js";

export function createSingularitySDK(config?: SDKConfig): SingularitySDK {
    return new SingularitySDK(config);
}

export { SingularitySDK } from "./client.js";
export * from "./types.js";
export * from "./errors.js";
export { snakeToCamel, parseJsonColumn, parseStepOutput, resolvePath } from "./utils.js";

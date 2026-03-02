import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SDKError } from "../errors.js";

const execFileAsync = promisify(execFile);

export class CliTransport {
    constructor(private binary: string = "openclaw") {}

    async run(args: string[]): Promise<string> {
        try {
            const result: unknown = await execFileAsync(this.binary, args, {
                timeout: 30_000,
                maxBuffer: 1024 * 1024,
            });

            // Node's real child_process.execFile promisified shape is typically:
            //   { stdout: string; stderr: string }
            // But when execFile is mocked (and lacks util.promisify.custom), promisify may
            // resolve to stdout as a plain string.
            const stdout =
                typeof result === "string"
                    ? result
                    : result && typeof result === "object" && "stdout" in result
                        ? (result as { stdout?: unknown }).stdout
                        : undefined;

            if (typeof stdout !== "string") {
                throw new SDKError(`CLI returned unexpected result for: ${this.binary} ${args.join(" ")}`, undefined, {
                    cause: result as any,
                });
            }

            return stdout.trim();
        } catch (err) {
            if (err instanceof SDKError) {
                throw err;
            }
            throw new SDKError(`CLI error: ${this.binary} ${args.join(" ")}`, undefined, { cause: err as Error });
        }
    }

    async runJSON<T>(args: string[]): Promise<T> {
        const output = await this.run(args);
        return JSON.parse(output) as T;
    }
}

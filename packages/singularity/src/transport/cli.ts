import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SDKError } from "../errors.js";

const execFileAsync = promisify(execFile);

export class CliTransport {
    constructor(private binary: string = "openclaw") {}

    async run(args: string[]): Promise<string> {
        try {
            const { stdout } = await execFileAsync(this.binary, args, {
                timeout: 30_000,
                maxBuffer: 1024 * 1024,
            });
            return stdout.trim();
        } catch (err) {
            throw new SDKError(`CLI error: ${this.binary} ${args.join(" ")}`, undefined, { cause: err as Error });
        }
    }

    async runJSON<T>(args: string[]): Promise<T> {
        const output = await this.run(args);
        return JSON.parse(output) as T;
    }
}

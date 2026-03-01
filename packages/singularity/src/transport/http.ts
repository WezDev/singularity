import { SDKError, GatewayError } from "../errors.js";

export class HttpTransport {
    private headers: Record<string, string>;

    constructor(private baseUrl: string, authToken?: string) {
        this.headers = { "Content-Type": "application/json" };
        if (authToken) {
            this.headers["Authorization"] = `Bearer ${authToken}`;
        }
    }

    async invoke(tool: string, action: string, payload?: Record<string, unknown>): Promise<unknown> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/tools/invoke`, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({ tool, action, payload }),
            });
        } catch (err) {
            throw new SDKError(`Gateway connection failed`, { tool, action }, { cause: err as Error });
        }
        if (!res.ok) {
            throw new GatewayError(res.status, await res.text());
        }
        return res.json();
    }

    async get(path: string): Promise<unknown> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}${path}`, {
                headers: this.headers,
            });
        } catch (err) {
            throw new SDKError(`Gateway connection failed`, { path }, { cause: err as Error });
        }
        if (!res.ok) {
            throw new GatewayError(res.status, await res.text());
        }
        return res.json();
    }
}

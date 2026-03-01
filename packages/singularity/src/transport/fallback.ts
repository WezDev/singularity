import { GatewayError } from "../errors.js";

export function isConnectionError(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes("connection refused") || msg.includes("connection failed") || msg.includes("econnrefused") || msg.includes("fetch failed")) {
            return true;
        }
        if (err.cause && isConnectionError(err.cause)) {
            return true;
        }
    }
    return false;
}

function isToolNotAvailable(err: unknown): boolean {
    if (err instanceof GatewayError) {
        return err.message.includes("Tool not available");
    }
    return false;
}

export async function withFallback<T>(
    httpFn: () => Promise<T>,
    cliFn: () => Promise<T>,
): Promise<T> {
    try {
        return await httpFn();
    } catch (err) {
        if (isConnectionError(err) || isToolNotAvailable(err)) {
            return await cliFn();
        }
        throw err;
    }
}

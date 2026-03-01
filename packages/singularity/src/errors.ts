export class SDKError extends Error {
    constructor(
        message: string,
        public readonly context?: Record<string, unknown>,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "SDKError";
    }
}

export class NotFoundError extends SDKError {
    constructor(resource: string, id: string) {
        super(`${resource} not found: ${id}`, { resource, id });
        this.name = "NotFoundError";
    }
}

export class GatewayError extends SDKError {
    constructor(status: number, message: string) {
        super(`Gateway returned ${status}: ${message}`, { status });
        this.name = "GatewayError";
    }
}

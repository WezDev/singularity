export class DashboardServer {
    private port: number;

    constructor(port = 3333) {
        this.port = port;
    }

    async start(): Promise<void> {
        console.log(`Dashboard server would start on port ${this.port}`);
        console.log("Not yet implemented.");
    }

    async stop(): Promise<void> {
        console.log("Dashboard server stopped.");
    }

    async status(): Promise<boolean> {
        return false;
    }
}

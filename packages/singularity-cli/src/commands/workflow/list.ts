import { createSingularitySDK } from "@wezdev/singularity";

export async function list(_args: string[]): Promise<void> {
    const sdk = createSingularitySDK();
    const workflows = await sdk.workflows.list();

    if (workflows.length === 0) {
        console.log("No workflows found.");
        return;
    }

    console.log("Available workflows:");
    for (const wf of workflows) {
        const name = wf.name.padEnd(25);
        const status = wf.status === "installed" ? "installed" : "not installed";
        console.log(`  ${wf.id.padEnd(16)}${name}${wf.agents.length} agents, ${wf.runs.length} runs  [${status}]`);
    }
}

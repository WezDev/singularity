export function buildPollingPrompt(workflowId: string, agentId: string): string {
    return `Run: singularity step claim --workflow ${workflowId} --agent ${agentId}
If the output is NO_WORK, reply with HEARTBEAT_OK and stop immediately.
If work is returned, execute the task described, then report results.`;
}

export function staggerSchedule(index: number, totalAgents: number): string {
    // Stagger agents across the 15-minute window
    const minuteOffset = Math.floor((index / totalAgents) * 15);
    if (minuteOffset === 0) return `*/15 * * * *`;
    return `${minuteOffset}-59/15 * * * *`;
}

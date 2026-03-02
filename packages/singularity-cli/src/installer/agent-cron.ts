export function buildPollingPrompt(workflowId: string, agentId: string): string {
    return `Run: singularity step claim --workflow ${workflowId} --agent ${agentId}
If the output is NO_WORK, reply with HEARTBEAT_OK and stop immediately.
If work is returned, note the STEP_ID from the output, then execute the task described.
When done, pipe your full output (including STATUS:, and any other KEY: value lines) to:
  echo "<your output>" | singularity step complete --step <STEP_ID>
If the task fails, pipe the output to:
  echo "<your output>" | singularity step fail --step <STEP_ID>
You MUST call step complete or step fail before stopping.`;
}

export function staggerSchedule(index: number, totalAgents: number, intervalMinutes = 5): string {
    // Stagger agents across the polling window
    const minuteOffset = Math.floor((index / totalAgents) * intervalMinutes);
    if (minuteOffset === 0) return `*/${intervalMinutes} * * * *`;
    return `${minuteOffset}-59/${intervalMinutes} * * * *`;
}

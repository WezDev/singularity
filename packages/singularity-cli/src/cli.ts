#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

async function main() {
    switch (command) {
        case "install": {
            const m = await import("./commands/install.js");
            return m.install(args.slice(1));
        }
        case "uninstall": {
            const m = await import("./commands/uninstall.js");
            return m.uninstall(args.slice(1));
        }
        case "workflow":
            switch (subcommand) {
                case "run": {
                    const m = await import("./commands/workflow/run.js");
                    return m.run(args.slice(2));
                }
                case "status": {
                    const m = await import("./commands/workflow/status.js");
                    return m.status(args.slice(2));
                }
                case "list": {
                    const m = await import("./commands/workflow/list.js");
                    return m.list(args.slice(2));
                }
                case "runs": {
                    const m = await import("./commands/workflow/runs.js");
                    return m.runs(args.slice(2));
                }
                case "resume": {
                    const m = await import("./commands/workflow/resume.js");
                    return m.resume(args.slice(2));
                }
                case "stop": {
                    const m = await import("./commands/workflow/stop.js");
                    return m.stop(args.slice(2));
                }
                case "install": {
                    const m = await import("./commands/workflow/install.js");
                    return m.install(args.slice(2));
                }
                case "uninstall": {
                    const m = await import("./commands/workflow/uninstall.js");
                    return m.uninstall(args.slice(2));
                }
                default:
                    console.error(`Unknown workflow command: ${subcommand}`);
                    process.exit(1);
            }
            break;

        case "step":
            switch (subcommand) {
                case "claim": {
                    const m = await import("./commands/step/claim.js");
                    return m.claim(args.slice(2));
                }
                case "complete": {
                    const m = await import("./commands/step/complete.js");
                    return m.complete(args.slice(2));
                }
                case "fail": {
                    const m = await import("./commands/step/fail.js");
                    return m.fail(args.slice(2));
                }
                case "stories": {
                    const m = await import("./commands/step/stories.js");
                    return m.stories(args.slice(2));
                }
                default:
                    console.error(`Unknown step command: ${subcommand}`);
                    process.exit(1);
            }
            break;

        case "dashboard": {
            const m = await import("./commands/dashboard.js");
            return m.dashboard(args.slice(1));
        }

        case "logs": {
            const m = await import("./commands/logs.js");
            return m.logs(args.slice(1));
        }

        case "version":
            console.log("0.1.0");
            break;

        default:
            console.log(`Usage: singularity <command> [options]

Commands:
  install                     Provision all workflows
  uninstall [--force]         Full teardown
  workflow run <id> [--run <run-id>] <task>
                            Start a workflow run
  workflow status <query>     Check run status
  workflow list               List available workflows
  workflow runs               List all runs
  workflow resume <run-id>    Resume a failed run
  workflow stop <run-id>      Cancel a running run
  workflow install <id>       Install a single workflow
  workflow uninstall <id>     Remove a single workflow
  step claim                  Agent: check for work
  step complete               Agent: report success
  step fail                   Agent: report failure
  step stories                Agent: list stories for loop step
  dashboard                   Start monitoring dashboard
  logs [<lines>]              View recent events
  version                     Show version`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

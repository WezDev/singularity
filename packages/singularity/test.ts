import { createSingularitySDK } from "./src/index";
(async () => {
    try {
        const singluaritySdk = createSingularitySDK()
    
        const settings = { enableReads: true, enableWrites: false, enableDeletes: false, enableUpdates: false };
        
        if (settings.enableReads) {
            const agents = await singluaritySdk.agents.list();
            console.log("AGENTS", agents);
            
            const crons = await singluaritySdk.cron.list();
            console.log("CRONS", crons);
            
            const skills = await singluaritySdk.skills.list();
            console.log("SKILLS", skills);
            
            const activity = await singluaritySdk.activity.list();
            console.log("ACTIVITY", activity);
    
            const usage = await singluaritySdk.usage.summary();
            console.log("USAGE", usage);

            const workflows = await singluaritySdk.workflows.list();
            console.log("WORKFLOWS", workflows);

            const tasks = await singluaritySdk.tasks.list();
            console.log("TASKS", tasks, tasks?.data[0].steps, tasks?.data[0].progress);
            console.log("STEPS",tasks?.data[0].steps);
            console.log("PROGRESS",tasks?.data[0].progress);
        }
        if (settings.enableWrites) {
            
            await singluaritySdk.skills.create({
                id: "insert test",
                description: "this is a test",
                content: "just checking if this works"
            })
    
        }
        if (settings.enableUpdates) {

        }
        if (settings.enableDeletes) {

        }
    } catch (e) {
        console.log(e)
    }

})();
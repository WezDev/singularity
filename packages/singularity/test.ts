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
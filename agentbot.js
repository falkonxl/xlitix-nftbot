import { runCollectionUpdaterAgent, runCollectionAggregatorAgent } from './agents/collectionagents.js';
import { runBiddingAgent } from './agents/bidagents.js';
import { runListingAgent } from './agents/listingagent.js';
import { CronJob } from 'cron';
let collections = [];
let isCollectionUpdatedAgentRunning = false;
let isCollectionAggregatorAgentRunning = false;
let isListingAgentRunning = false;
let isBiddingAgentRunning = false;

const runCollectionUpdatedAgentJob = new CronJob('0 * * * *', async () => {
    if (isCollectionUpdatedAgentRunning || isCollectionAggregatorAgentRunning)
        return;
    isCollectionUpdatedAgentRunning = true;
    try {
        collections = await runCollectionUpdaterAgent(collections);
        if(collections.length == 0)
            return;
    }
    catch (err) {
        console.error(err);
    }
    isCollectionUpdatedAgentRunning = false;
});

const runCollectionAggregatorAgentJob = new CronJob('0 0 * * *', async () => {
    if (isCollectionUpdatedAgentRunning || isCollectionAggregatorAgentRunning)
        return;
    isCollectionUpdatedAgentRunning = true;
    try {
        collections = await runCollectionAggregatorAgent(collections);
        if(collections.length == 0)
            return;
    }
    catch (err) {
        console.error(err);
    }
    isCollectionUpdatedAgentRunning = false;
});

const runListingAgentJob = new CronJob('*/3 * * * *', async () => {
    if (isListingAgentRunning)
        return;
    isListingAgentRunning = true;
    try {
        if(collections.length == 0)
            return;
        await runListingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isListingAgentRunning = false;
});

const runBiddingAgentJob = new CronJob('* * * * *', async () => {
    if (isBiddingAgentRunning)
        return;
    isBiddingAgentRunning = true;
    try {
        if(collections.length == 0)
            return;
        await runBiddingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isBiddingAgentRunning = false;
});



async function main() {
    // do initial run of collection aggregator agent
    collections = await runCollectionAggregatorAgent(collections);
    // start cron jobs
    runCollectionUpdatedAgentJob.start();
    runCollectionAggregatorAgentJob.start();
    runListingAgentJob.start();
    runBiddingAgentJob.start();
}

main();
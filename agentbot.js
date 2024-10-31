import { runCollectionUpdaterAgent, runCollectionAggregatorAgent } from './agents/collectionagents.js';
import { runBlurBiddingAgent } from './agents/blurbidagents.js';
import { runListingAgent } from './agents/listingagent.js';
import { runOpenSeaBiddingAgent } from './agents/openseabidagent.js';
import { CronJob } from 'cron';

let collections = [];
let isCollectionUpdatedAgentRunning = false;
let isCollectionAggregatorAgentRunning = false;
let isListingAgentRunning = false;
let isBlurBiddingAgentRunning = false;
let isOpenSeaBiddingAgentRunning = false;
let lastOpenSeaBiddingAgentRun = new Date(0);

const runCollectionUpdatedAgentJob = new CronJob('0 * * * *', async () => {
    if (isCollectionUpdatedAgentRunning || isCollectionAggregatorAgentRunning)
        return;
    isCollectionUpdatedAgentRunning = true;
    try {
        collections = await runCollectionUpdaterAgent(collections);
        if (collections.length == 0)
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
        if (collections.length == 0)
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
        if (collections.length == 0)
            return;
        await runListingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isListingAgentRunning = false;
});

const runBlurBiddingAgentJob = new CronJob('* * * * *', async () => {
    if (isBlurBiddingAgentRunning)
        return;
    isBlurBiddingAgentRunning = true;
    try {
        if (collections.length == 0)
            return;
        await runBlurBiddingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isBlurBiddingAgentRunning = false;
});

const runOpenSeaBiddingAgentJob = new CronJob('* * * * *', async () => {
    if (new Date() - lastOpenSeaBiddingAgentRun < 15 * 6e4 || isOpenSeaBiddingAgentRunning)
        return;
    lastOpenSeaBiddingAgentRun = new Date();
    isOpenSeaBiddingAgentRunning = true;
    try {
        if (collections.length == 0)
            return;
        await runOpenSeaBiddingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isOpenSeaBiddingAgentRunning = false;
});

async function main() {
    // do initial run of collection aggregator agent
    collections = await runCollectionAggregatorAgent(collections);
    // start cron jobs
    runCollectionUpdatedAgentJob.start();
    runCollectionAggregatorAgentJob.start();
    runListingAgentJob.start();
    runBlurBiddingAgentJob.start();
    runOpenSeaBiddingAgentJob.start();
}

main();
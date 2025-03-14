import { runCollectionUpdaterAgent, runCollectionAggregatorAgent } from './agents/collectionagents.js';
import { runBlurBiddingAgent } from './agents/blurbidagents.js';
import { runBlurListingAgent, runOpenSeaListingAgent } from './agents/listingagents.js';
import { runOpenSeaBiddingAgent } from './agents/openseabidagent.js';
import { CronJob } from 'cron';
import logger from "./helpers/logger.js";

let collections = [];
let isCollectionUpdatedAgentRunning = false;
let isCollectionAggregatorAgentRunning = false;
let isBlurListingAgentRunning = false;
let isOpenSeaListingAgentRunning = false;
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

const runBlurListingAgentJob = new CronJob('*/3 * * * *', async () => {
    if (isBlurListingAgentRunning)
        return;
    isBlurListingAgentRunning = true;
    try {
        if (collections.length == 0)
            return;
        await runBlurListingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isBlurListingAgentRunning = false;
});

const runOpenSeaListingAgentJob = new CronJob('*/3 * * * *', async () => {
    if (isOpenSeaListingAgentRunning)
        return;
    isOpenSeaListingAgentRunning = true;
    try {
        if (collections.length == 0)
            return;
        await runOpenSeaListingAgent(collections);
    }
    catch (err) {
        console.error(err);
    }
    isOpenSeaListingAgentRunning = false;
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
    if (new Date() - lastOpenSeaBiddingAgentRun < 20 * 6e4 || isOpenSeaBiddingAgentRunning)
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
    logger("LOG", "MAIN BOT AGENT", "Starting bot v. 0.7.3...");
    // do initial run of collection aggregator agent
    collections = await runCollectionAggregatorAgent(collections);
    // start cron jobs
    runCollectionUpdatedAgentJob.start();
    runCollectionAggregatorAgentJob.start();
    runBlurListingAgentJob.start();
    runOpenSeaListingAgentJob.start();
    runBlurBiddingAgentJob.start();
    runOpenSeaBiddingAgentJob.start();
}

main();
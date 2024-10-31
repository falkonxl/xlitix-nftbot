import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "../helpers/logger.js";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const openSeaWaitTime = 500;

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

async function submitOpenSeaListing(contractAddress, tokenId, listPrice) {
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            await openseaSDK.createListing({
                asset: {
                    tokenId: tokenId,
                    tokenAddress: contractAddress,
                },
                accountAddress: process.env.WALLET_ADDRESS,
                startAmount: listPrice,
                expirationTime: Math.round(Date.now() / 1000 + process.env.LISTING_DURATION_IN_MINUTES * 60),
                excludeOptionalCreatorFees: true
            });
            return true;
        }
        catch (err) {
            if (retryCount++ > 3)
                return null;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
}

async function getOpenSeaCollectionStats(slug) {
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            return await openseaSDK.api.getCollectionStats(slug);
        }
        catch (err) {
            if (retryCount++ > 3)
                return null;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
}

async function getOpenSeaCollection(slug) {
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            return await openseaSDK.api.getCollection(slug);
        }
        catch (err) {
            if (retryCount++ > 3)
                return null;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
}


async function getOpenSeaListings(slug) {
    let next = null;
    let listings = [];
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            let response = await openseaSDK.api.getAllListings(slug, 100, next);
            if (response == null || response.listings == null || response.listings.length == 0)
                break;
            listings = listings.concat(response.listings);
            next = response.next;
            if (next == null || listings.length < 100)
                break;
        }
        catch (err) {
            if (retryCount++ > 3)
                break;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
    return { listings: listings };
}

async function getOpenSeaCollectionOffers(slug) {
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            return await openseaSDK.api.getCollectionOffers(slug);
        }
        catch (err) {
            if (retryCount++ > 3)
                return null;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
}

async function submitOpenSeaOffer(slug, offerPrice, offerQuantity, trait) {
    let retryCount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            await openseaSDK.createCollectionOffer({
                collectionSlug: slug,
                accountAddress: process.env.WALLET_ADDRESS,
                paymentTokenAddress: process.env.WETH_CONTRACT_ADDRESS,
                amount: offerPrice,
                quantity: offerQuantity,
                traitType: trait.key,
                traitValue: trait.value,
                expirationTime: Math.round(Date.now() / 1000 + process.env.OFFER_DURATION_IN_MINUTES * 60),
                excludeOptionalCreatorFees: true,
                offerProtectionEnabled: true
            });
            return true;
        }
        catch (err) {
            if (retryCount++ > 3 || err.response == null)
                return false;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
            if (err.response?.statusCode == 599)
                await sleep(err.response.headers['retry-after'] ? err.response.headers['retry-after'] * 1000 : 1500);
        }
    }
}

export { submitOpenSeaListing, getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings, submitOpenSeaOffer, getOpenSeaCollection };
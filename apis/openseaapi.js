import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "../helpers/logger.js";
import sendHttpRequest from '../helpers/httprequest.js';
const sleepinterval = 1400;

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const openSeaWaitTime = 100;

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-RapidAPI-Key": process.env.RAPID_SHARE_OPENSEAAPI_KEY
}

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
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${contractAddress} - ${err.message}`);
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

async function createOpenSeaCollectionOffer(slug, offerPrice, offerQuantity, traits) {
    let retrycount = 0;
    let payload = {
        criteria: {
            slug: slug,
            traitIdentifier: traits.map(({ key, value }) => ({
                traitType: key,
                value: value,
            }))
        },
        quantity: offerQuantity,
        price: offerPrice,
        currencyContract: process.env.WETH_CONTRACT_ADDRESS,
        walletAddress: process.env.WALLET_ADDRESS
    }
    while (true) {
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_OPENSEAAPI_URL}/collection/offer/create`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.errors != null || response.error != null) {
            if(response?.errors?.message != null)
                logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${response.errors.message}`);
            retrycount++;
            if (retrycount > 3)
                return { httperror: true };
            await sleep(sleepinterval);
            continue;
        }
        else {
            if (response.data?.createCollectionOfferActions == null)
                return;
            return response.data.createCollectionOfferActions;
        }
    }
}

async function submitOpenSeaCollectionOffer(slug, traits, order, signature) {
    let retrycount = 0;
    let payload = {
        criteria: {
            slug: slug,
            traitIdentifier: traits.map(({ key, value }) => ({
                traitType: key,
                value: value,
            }))
        },
        order: order,
        signature: signature
    }
    while (true) {
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_OPENSEAAPI_URL}/collection/offer/submit`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.errors != null || response.error != null) {
            retrycount++;
            if (retrycount > 3)
                return { httperror: true };
            await sleep(sleepinterval);
            continue;
        }
        else {
            if (response.data?.createCollectionOfferV2 == null)
                return;
            return response.data.createCollectionOfferV2;
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

async function getOpenSeaCollectionTraitOffers(slug) {
    let cursor = null;
    let traitOffers = [];
    let retrycount = 0;
    while (true) {
        try {
            await sleep(openSeaWaitTime);
            let payload = {
                slug: slug,
                cursor: cursor
            }
            const response = await sendHttpRequest(`${process.env.RAPID_SHARE_OPENSEAAPI_URL}/collection/attributes/offers`, "POST", headers, sleepinterval, 3, payload);
            if (response == null || response.errors != null || response.error != null) {
                if (retrycount++ > 3)
                    return { httperror: true };
                await sleep(sleepinterval);
                continue;
            }
            else {
                if (response.data?.traitOfferAggregates != null || response.data?.traitOfferAggregates?.items != null){
                    if(cursor != null && cursor == response.data.traitOfferAggregates.nextPageCursor)
                        break;
                    traitOffers = traitOffers.concat(response.data.traitOfferAggregates.items);
                    cursor = response.data.traitOfferAggregates.nextPageCursor;
                    if (cursor == null || response.data.traitOfferAggregates.items.length < 100)
                        break;
                }
                else
                {
                    if (retrycount++ > 3)
                        return { processingerror: true };
                    continue;
                }
            }            
        }
        catch (err) {
            if (retrycount++ > 3)
                break;
            logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        }
    }
    return { traitOffers: traitOffers };
}

async function getOpenSeaToken(contractAddress, tokenId) {
    let retrycount = 0;
    let payload = {
        contractAddress: contractAddress,
        tokenId: tokenId
    }
    while (true) {
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_OPENSEAAPI_URL}/collection/token`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.errors != null || response.error != null) {
            retrycount++;
            if (retrycount > 3)
                return { httperror: true };
            await sleep(sleepinterval);
            continue;
        }
        else {
            if (response.data?.itemsByIdentifiers == null)
                return;
            return response.data.itemsByIdentifiers;
        }
    }
}

export { getOpenSeaToken, getOpenSeaCollectionTraitOffers, submitOpenSeaListing, getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings, submitOpenSeaOffer, getOpenSeaCollection, createOpenSeaCollectionOffer, submitOpenSeaCollectionOffer };
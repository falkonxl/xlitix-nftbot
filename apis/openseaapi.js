import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "../helpers/logger.js";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

async function submitOpenSeaListing(contractAddress, tokenId, listPrice) {
    try{
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
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `TOKEN ${contractAddress}:${tokenId} - ${err.message}`);
        return false;
    }
}

async function getOpenSeaCollectionStats(slug) {
    try{
        return await openseaSDK.api.getCollectionStats(slug);
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

async function getOpenSeaListings(slug)
{
    try{
        let next = null;
        let listings = [];
        while(true){
            let response = await openseaSDK.api.getAllListings(slug, 100, next);
            if(response == null || response.listings == null || response.listings.length == 0)
                break;
            listings = listings.concat(response.listings);
            next = response.next;
            if(next == null || listings.length < 100)
                break;
        }
        return { listings: listings };
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

async function getOpenSeaCollectionOffers(slug)
{
    try{
        return await openseaSDK.api.getCollectionOffers(slug);
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

export { submitOpenSeaListing, getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings };
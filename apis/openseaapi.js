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
        return await openseaSDK.getCollectionStats(slug);
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

async function getOpenSeaListings(slug)
{
    try{
        return await openseaSDK.getAllListings(slug);
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

async function getOpenSeaCollectionOffers(slug)
{
    try{
        return await openseaSDK.getCollectionOffers(slug);
    }
    catch(err){
        logger("ERROR", "OPENSEA ERROR", `COLLECTION ${slug} - ${err.message}`);
        return null;
    }
}

export { submitOpenSeaListing, getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings };
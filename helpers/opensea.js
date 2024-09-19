import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "./logger";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

async function submitOpenSeaListing(contractAddress, tokenId, listPrice) {
    try{
        const listing = await openseaSDK.createListing({
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

export { submitOpenSeaListing };
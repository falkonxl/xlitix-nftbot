import { getUserTokens, getTokenListingEvents, getBlurListPrice, submitBlurListings } from "../helpers/blur.js";
import { submitOpenSeaListing, getOpenSeaToken } from '../apis/openseaapi.js';
import { getOpenSeaListingPrice } from '../helpers/opensea.js';
import logger from "../helpers/logger.js";
import 'dotenv/config'

async function runBlurListingAgent(collections) {
    logger("LOG", "BLUR LISTING AGENT", "Downloading user tokens data...");
    let userTokens = await getUserTokens();
    logger("LOG", "BLUR LISTING AGENT", "User tokens data donwload complete.");
    // filter out tokens that have been in the wallet for more than process.env.MAX_NUMBER_OF_DAYS_IN_WALLET
    userTokens = userTokens.filter(t => new Date(t.lastSale?.listedAt) > new Date(Date.now() - process.env.MAX_NUMBER_OF_DAYS_IN_WALLET * 8.64e7));
    for (let i = 0; i < userTokens.length; i++) {
        let token = userTokens[i];
        let collectionData = collections.find(c => c.contractAddress == token.contractAddress);
        let openSeaTokenInfo =await getOpenSeaToken(token.contractAddress, token.tokenId);
        let openSeaTokeRarityRank = 0;
        if(openSeaTokenInfo?.length > 0 && openSeaTokenInfo[0].rarity?.rank != null)
            openSeaTokeRarityRank = openSeaTokenInfo[0].rarity?.rank.toFixed(0) * 1;
        let blurRarityRank = token.rarityRank;
        let tokenListingEvents = await getTokenListingEvents(token.contractAddress, token.tokenId);
        if (tokenListingEvents == null)
            continue;
        if (token.asks.filter(a => a.marketplace == "BLUR").length == 0 ||
            (token.asks.filter(a => a.marketplace == "BLUR").length > 0 && tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4) && new Date(e.createdAt) < new Date(Date.now() - (process.env.LISTING_DURATION_IN_MINUTES - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES) * 6e4)).length > 0
                && tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES * 6e4)).length == 0)) {
            let listingPriceInfo = await getBlurListPrice(token.contractAddress, collectionData, blurRarityRank, openSeaTokeRarityRank);
            if (listingPriceInfo != null && listingPriceInfo.blurListPrice != null) {
                if (await submitBlurListings(token.contractAddress, token.tokenId, listingPriceInfo.blurListPrice))
                    logger("LOG", "CREATE LISTING [BLUR]", `Creating a listing for token ${token.contractAddress}:${token.tokenId} at ${listingPriceInfo.blurListPrice.toFixed(6)} ETH`);
            }
        }
    }
}

async function runOpenSeaListingAgent(collections) {
    logger("LOG", "OPENSEA LISTING AGENT", "Downloading user tokens data...");
    let userTokens = await getUserTokens();
    logger("LOG", "OPENSEALISTING AGENT", "User tokens data donwload complete.");
    // filter out tokens that have been in the wallet for more than process.env.MAX_NUMBER_OF_DAYS_IN_WALLET
    userTokens = userTokens.filter(t => new Date(t.lastSale?.listedAt) > new Date(Date.now() - process.env.MAX_NUMBER_OF_DAYS_IN_WALLET * 8.64e7));
    for (let i = 0; i < userTokens.length; i++) {
        let token = userTokens[i];
        let collectionData = collections.find(c => c.contractAddress == token.contractAddress);
        let openSeaTokenInfo =await getOpenSeaToken(token.contractAddress, token.tokenId);
        let openSeaTokeRarityRank = 0;
        if(openSeaTokenInfo?.length > 0 && openSeaTokenInfo[0].rarity?.rank != null)
            openSeaTokeRarityRank = openSeaTokenInfo[0].rarity?.rank.toFixed(0) * 1;
        let blurRarityRank = token.rarityRank;
        let tokenListingEvents = await getTokenListingEvents(token.contractAddress, token.tokenId);
        if (tokenListingEvents == null)
            continue;
        if (token.asks.filter(a => a.marketplace == "OPENSEA").length == 0 ||
            (token.asks.filter(a => a.marketplace == "OPENSEA").length > 0 && tokenListingEvents.filter(e => e.marketplace == "OPENSEA" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4) && new Date(e.createdAt) < new Date(Date.now() - (process.env.LISTING_DURATION_IN_MINUTES - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES) * 6e4)).length > 0
                && tokenListingEvents.filter(e => e.marketplace == "OPENSEA" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES * 6e4)).length == 0)) {
            let listingPriceInfo = await getOpenSeaListingPrice(collectionData, blurRarityRank, openSeaTokeRarityRank);
            if (listingPriceInfo != null && listingPriceInfo.openSeaListingPrice != null) {
                if (await submitOpenSeaListing(token.contractAddress, token.tokenId, listingPriceInfo.openSeaListingPrice))
                    logger("LOG", "CREATE LISTING [OPENSEA]", `Creating a listing for token ${token.contractAddress}:${token.tokenId} at ${listingPriceInfo.openSeaListingPrice.toFixed(6)} ETH`);
            }
        }
    }
}

export { runBlurListingAgent, runOpenSeaListingAgent };
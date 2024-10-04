import { getUserTokens, getTokenListingEvents, getBlurListPrice, submitBlurListings } from "../helpers/blur.js";
import { submitOpenSeaListing } from '../apis/openseaapi.js';
import { getOpenSeaListingPrice } from '../helpers/opensea.js';
import logger from "../helpers/logger.js";
import 'dotenv/config'

async function runListingAgent(collections) {
    logger("LOG", "LISTING AGENT", "Downloading user tokens data...");
    let userTokens = await getUserTokens();
    logger("LOG", "LISTING AGENT", "User tokens data donwload complete.");
    // filter out tokens that have been in the wallet for more than process.env.MAX_NUMBER_OF_DAYS_IN_WALLET
    userTokens = userTokens.filter(t => new Date(t.lastSale?.listedAt) > new Date(Date.now() - process.env.MAX_NUMBER_OF_DAYS_IN_WALLET * 8.64e7));
    for (let i = 0; i < userTokens.length; i++) {
        let token = userTokens[i];
        let collectionData = collections.find(c => c.contractAddress == token.contractAddress);
        let tokenListingEvents = await getTokenListingEvents(token.contractAddress, token.tokenId);
        if (tokenListingEvents == null)
            continue;
        let x = tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4)).length;
        let y = tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4) && new Date(e.createdAt) < new Date(Date.now() - (process.env.LISTING_DURATION_IN_MINUTES - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES) * 6e4)).length;
        // check to see if token has no active BLUR listings or active BLUR listings that do not expire within the next process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES and have been listed for no more than process.env.LISTING_DURATION_IN_MINUTES
        if (token.asks.filter(a => a.marketplace == "BLUR").length == 0 ||
            (token.asks.filter(a => a.marketplace == "BLUR").length > 0 && tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4) && new Date(e.createdAt) < new Date(Date.now() - (process.env.LISTING_DURATION_IN_MINUTES - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES) * 6e4)).length > 0
                && tokenListingEvents.filter(e => e.marketplace == "BLUR" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES * 6e4)).length == 0)) {
            let listingPriceInfo = await getBlurListPrice(token.contractAddress, collectionData, token.rarityRank);
            if (listingPriceInfo != null && listingPriceInfo.blurListPrice != null) {
                if (await submitBlurListings(token.contractAddress, token.tokenId, listingPriceInfo.blurListPrice))
                    logger("LOG", "CREATE LISTING [BLUR]", `Creating a listing for token ${token.contractAddress}:${token.tokenId} at ${listingPriceInfo.blurListPrice.toFixed(6)} ETH`);
            }
        }
        if (token.asks.filter(a => a.marketplace == "OPENSEA").length == 0 ||
            (token.asks.filter(a => a.marketplace == "OPENSEA").length > 0 && tokenListingEvents.filter(e => e.marketplace == "OPENSEA" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_DURATION_IN_MINUTES * 6e4) && new Date(e.createdAt) < new Date(Date.now() - (process.env.LISTING_DURATION_IN_MINUTES - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES) * 6e4)).length > 0
                && tokenListingEvents.filter(e => e.marketplace == "OPENSEA" && e.fromTrader.address.toLowerCase() == process.env.WALLET_ADDRESS.toLowerCase() && new Date(e.createdAt) > new Date(Date.now() - process.env.LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES * 6e4)).length == 0)) {
            let listingPriceInfo = await getOpenSeaListingPrice(collectionData, token.rarityRank);
            if (listingPriceInfo != null && listingPriceInfo.openSeaListingPrice != null) {
                if (await submitOpenSeaListing(token.contractAddress, token.tokenId, listingPriceInfo.openSeaListingPrice))
                    logger("LOG", "CREATE LISTING [OPENSEA]", `Creating a listing for token ${token.contractAddress}:${token.tokenId} at ${listingPriceInfo.openSeaListingPrice.toFixed(6)} ETH`);
            }
        }
    }
}

export { runListingAgent };
import { submitOpenSeaTraitBids, getWETHBalance } from "../helpers/opensea.js";
import { getUserTokens } from "../helpers/blur.js";
import logger from "../helpers/logger.js";
import 'dotenv/config'

async function runOpenSeaBiddingAgent(collections) {
    logger("LOG", "OPENSEA BIDDING AGENT", "Downloading user tokens data...");
    let userTokens = await getUserTokens();
    logger("LOG", "OPENSEA BIDDING AGENT", "User tokens data donwload complete.");
    // select collections to bid on
    let selectedCollections = collections.filter(c => c.attributesTotalCount > 10 && (c.opensea?.thirtyDayAverageDailyAverageFloorPrice / c.opensea?.sevenDayAverageDailyAverageFloorPrice) > .75 
        && (c.blur?.sevenDayAverageDailyListingSales + c.opensea?.sevenDayAverageDailyListingSales) >= 3
        && c.opensea?.sevenDayFloorPriceIncreases > 2 
        && c.opensea?.sevenDayAverageDailyAverageFloorPrice > 0.03 
        && (c.blur.sevenDayAcceptedBidSales + c.opensea.sevenDayAcceptedBidSales) / (c.blur.sevenDayListingSales + c.opensea.sevenDayListingSales) < 1.5
        && c.opensea?.sevenDayAverageDailyAverageFloorPrice < .5
        && userTokens.filter(t => t.contractAddress === c.contractAddress).length < process.env.MAX_NUMBER_OF_NFTS_COLLECTED 
        && userTokens.filter(t => t.contractAddress === c.contractAddress && new Date(t.lastSale?.listedAt) > new Date(Date.now() - process.env.COOLDOWN_PERIOD_IN_MINUTES * 6e4)).length == 0
    );
    if(selectedCollections.length == 0)
        return;
    let wethBalance = await getWETHBalance();
    // place bids on Blur for each collection
    for (let i = 0; i < selectedCollections.length; i++) {
        await submitOpenSeaTraitBids(selectedCollections[i], { from: 0, to: 10}, wethBalance);
        await submitOpenSeaTraitBids(selectedCollections[i], { from: 10, to: 50}, wethBalance);
    }
}

export { runOpenSeaBiddingAgent };
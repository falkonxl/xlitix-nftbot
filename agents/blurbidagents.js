import { submitBlurTraitBids, removeBlurBidsForNoLongerQualifiedCollections, getUserBids } from "../helpers/blur.js";
import 'dotenv/config'
import logger from "../helpers/logger.js";

async function runBlurBiddingAgent(collections) {
    logger("LOG", "BIDDING AGENT", "Downloading user bids data...");
    let userBids = await getUserBids();
    logger("LOG", "BIDDING AGENT", "User bids data donwload complete.");
    // select collections to bid on
    let selectedCollections = collections.filter(c => c.attributesTotalCount > 10 && (c.blur?.thirtyDayAverageDailyAverageFloorPrice / c.blur?.sevenDayAverageDailyAverageFloorPrice) > .75 
        && (c.blur?.sevenDayAverageDailyListingSales + c.opensea?.sevenDayAverageDailyListingSales) >= 2 
        && c.blur?.sevenDayFloorPriceIncreases > 2 
        && c.blur?.sevenDayAverageDailyAverageFloorPrice > 0.03 
        && (c.blur.sevenDayAcceptedBidSales + c.opensea.sevenDayAcceptedBidSales) / (c.blur.sevenDayListingSales + c.opensea.sevenDayListingSales) < 1.75
        && c.blur?.sevenDayAverageDailyAverageFloorPrice < .5
    );
    if(selectedCollections.length == 0)
        return;
    await removeBlurBidsForNoLongerQualifiedCollections(selectedCollections, userBids);    
    // place bids on Blur for each collection
    for (let i = 0; i < selectedCollections.length; i++) {
        await submitBlurTraitBids(selectedCollections[i], userBids.filter(b => b.contractAddress == selectedCollections[i].contractAddress), { from: 0, to: 10});
        await submitBlurTraitBids(selectedCollections[i], userBids.filter(b => b.contractAddress == selectedCollections[i].contractAddress), { from: 10, to: 50});
    }
}

export { runBlurBiddingAgent };
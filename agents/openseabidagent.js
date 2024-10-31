import { submitOpenSeaTraitBids, getWETHBalance } from "../helpers/opensea.js";
import 'dotenv/config'

async function runOpenSeaBiddingAgent(collections) {
    // select collections to bid on
    let selectedCollections = collections.filter(c => c.attributesTotalCount > 10 && (c.opensea?.thirtyDayAverageDailyAverageFloorPrice / c.opensea?.sevenDayAverageDailyAverageFloorPrice) > .75 
        && (c.blur?.sevenDayAverageDailyListingSales + c.opensea?.sevenDayAverageDailyListingSales) >= 2 
        && c.opensea?.sevenDayFloorPriceIncreases > 2 
        && c.opensea?.sevenDayAverageDailyAverageFloorPrice > 0.03 
        && (c.blur.sevenDayAcceptedBidSales + c.opensea.sevenDayAcceptedBidSales) / (c.blur.sevenDayListingSales + c.opensea.sevenDayListingSales) < 1.75
        && c.opensea?.sevenDayAverageDailyAverageFloorPrice < .5
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
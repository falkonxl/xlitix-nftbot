import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "./logger.js";
import { getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings } from "../apis/openseaapi.js";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

async function getOpenSeaTraitBidAmount(collectionData, traitRarityPercentile) {
    if (collectionData.opensea?.rankingPercentile?.zeroToTen?.thirtyDayAcceptedBidSales < 3 && traitRarityPercentile.to <= 10) {
        logger("WARN", "SKIP BID", `{0-10} Skipping ${collectionData.slug} because not enough bid sales history in the zero to ten percentile.`);
        return;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAcceptedBidSales < 5 && traitRarityPercentile.to > 10) {
        logger("WARN", "SKIP BID", `{10-50} Skipping ${collectionData.slug} because not enough bid sales history in the ten to fifty percentile.`);
        return;
    }
    let bidAmount = 0;
    let collectionOpenSeaData = await getOpenSeaCollectionStats(collectionData.slug);
    if (collectionOpenSeaData?.total?.floor_price == null || collectionOpenSeaData?.total?.floor_price * 1 <= 0)
        return;
    let openSeaFloorPrice = collectionOpenSeaData?.total?.floor_price * 1;
    let openSeaListings = await getOpenSeaListings(collectionData.slug);
    if (openSeaListings == null || openSeaListings.listings == null || openSeaListings.listings.length == 0)
        return;
    let openseaCollectionOffers = await getOpenSeaCollectionOffers(collectionData.slug);
    if (openseaCollectionOffers == null || openseaCollectionOffers.offers == null || openseaCollectionOffers.offers.length == 0)
        return;
    const openSeaTopOffer = openseaCollectionOffers.offers.filter(o => o.protocol_data.parameters.offer[0].token.toLowerCase() == process.env.WETH_CONTRACT_ADDRESS.toLowerCase() && o.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
        function (a, b) {
            return (b.protocol_data.parameters.offer[0].startAmount / b.protocol_data.parameters.consideration[0].startAmount) - (a.protocol_data.parameters.offer[0].startAmount / a.protocol_data.parameters.consideration[0].startAmount);
        }
    )[0];
    if (!openSeaTopOffer)
        return;
    let openSeaTopBidAmount = (openSeaTopOffer.protocol_data.parameters.offer[0].startAmount / openSeaTopOffer.protocol_data.parameters.consideration[0].startAmount) / 1e18;
    bidAmount = openSeaTopBidAmount;

    if (traitRarityPercentile.to <= 10) {
        bidAmount = bidAmount.toFixed(4) * 1 + 0.0005;
        if (bidAmount > (collectionData.opensea.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4))
            logger("WARN", "BID ALERT", `{0-10} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(collectionData.opensea.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4)}}.`);
        else if (bidAmount < (collectionData.opensea.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4))
            logger("WARN", "BID ALERT", `{0-10} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(collectionData.opensea.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4)}}.`);
        if (bidAmount * 1.05 > collectionData.opensea.rankingPercentile.zeroToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio * openSeaFloorPrice) {
            logger("WARN", "SKIP BID", `{0-10} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    else if (traitRarityPercentile.to > 10) {
        bidAmount = bidAmount.toFixed(4) * 1 + 0.0005;
        // check to see if the bid amount is higher than the 7 day average floor price to protect against price spikes
        if (bidAmount > collectionData.opensea.sevenDayAverageDailyAverageFloorPrice)
            bidAmount = collectionData.opensea.sevenDayAverageDailyAverageFloorPrice.toFixed(4) * 1;
        if (bidAmount > (collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4))
            logger("WARN", "BID ALERT", `{10-50} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4)}}.`);
        else if (bidAmount < (collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4))
            logger("WARN", "BID ALERT", `{10-50} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * openSeaFloorPrice).toFixed(4)}}.`);
        if (bidAmount * 1.05 > collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio * openSeaFloorPrice) {
            logger("WARN", "SKIP BID", `{10-50} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    return bidAmount.toFixed(4) * 1;
}

async function getOpenSeaListingPrice(collectionData, rarityRank) {
    let collectionOpenSeaData = await getOpenSeaCollectionStats(collectionData.slug);
    if (collectionOpenSeaData?.total?.floor_price == null || collectionOpenSeaData?.total?.floor_price * 1 <= 0)
        return;
    let openSeaListingPrice = collectionOpenSeaData?.total?.floor_price * 1;
    var openSeaFloorPrice = collectionOpenSeaData?.total?.floor_price * 1;
    let rarityMultiplier = 1;
    let rarityRankPercentile = rarityRank / collectionData.totalSupply;
    if (collectionData?.opensea?.sevenDayAverageDailyAverageFloorPrice > 0)
        openSeaListingPrice = collectionData.opensea.sevenDayAverageDailyAverageFloorPrice.toFixed(6) * 1;
    let openseaCollectionOffers = await getOpenSeaCollectionOffers(collectionData.slug);
    if (openseaCollectionOffers == null || openseaCollectionOffers.offers == null || openseaCollectionOffers.offers.length == 0)
        return;
    const openSeaTopOffer = openseaCollectionOffers.offers.filter(o => o.protocol_data.parameters.offer[0].token.toLowerCase() == process.env.WETH_CONTRACT_ADDRESS.toLowerCase() && o.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
        function (a, b) {
            return (b.protocol_data.parameters.offer[0].startAmount / b.protocol_data.parameters.consideration[0].startAmount) - (a.protocol_data.parameters.offer[0].startAmount / a.protocol_data.parameters.consideration[0].startAmount);
        }
    )[0];
    if (!openSeaTopOffer)
        return;
    let openSeaTopBidAmount = (openSeaTopOffer.protocol_data.parameters.offer[0].startAmount / openSeaTopOffer.protocol_data.parameters.consideration[0].startAmount) / 1e18;

    if (openSeaTopBidAmount != null && openSeaTopBidAmount > openSeaListingPrice)
        openSeaListingPrice = openSeaTopBidAmount.toFixed(6) * 1;
    if (rarityRankPercentile <= .01) {
        rarityMultiplier = 1.28
        openSeaListingPrice = (openSeaListingPrice * rarityMultiplier).toFixed(6) * 1;
    }
    else if (rarityRankPercentile <= .1)
        openSeaListingPrice = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio * openSeaListingPrice;
    else if (rarityRankPercentile <= .25)
        openSeaListingPrice = collectionData.opensea.rankingPercentile.tenToTwentyFive.thirtyDayAverageListingSalePriceToFloorPriceRatio * openSeaListingPrice;
    else if (rarityRankPercentile <= .5)
        openSeaListingPrice = collectionData.opensea.rankingPercentile.twentyFiveToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio * openSeaListingPrice;
    openSeaListingPrice = openSeaListingPrice.toFixed(6) * 1;
    if(openSeaListingPrice == 0)
        return;
    if(openSeaListingPrice < openSeaFloorPrice)
        openSeaListingPrice = openSeaFloorPrice.toFixed(6) * 1;
    let openSeaListings = await getOpenSeaListings(collectionData.slug);
    if (openSeaListings == null || openSeaListings.listings == null || openSeaListings.listings.length == 0)
        return { openSeaListingPrice, rarityMultiplier };
    let sorted = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
        (a, b) =>  ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
    );
    let nextHigherPriceOpenSeaListing = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
        (a, b) =>  ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
    )[0];
    if (nextHigherPriceOpenSeaListing != null) {
        openSeaListingPrice = ((nextHigherPriceOpenSeaListing.price.current.value / nextHigherPriceOpenSeaListing.protocol_data.parameters.offer[0].startAmount) / 1e18).toFixed(6) * 1;
        // get the next higher priced token and if the price difference is less than 3% then set the price to the next higher price
        nextHigherPriceOpenSeaListing = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
            (a, b) =>  ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
        )[0];
        let nextHigherPriceOpenSeaListingPrice = ((nextHigherPriceOpenSeaListing.price.current.value / nextHigherPriceOpenSeaListing.protocol_data.parameters.offer[0].startAmount) / 1e18).toFixed(6) * 1;
        if (nextHigherPriceOpenSeaListing != null && openSeaListingPrice / nextHigherPriceOpenSeaListingPrice < .97)
            openSeaListingPrice = nextHigherPriceOpenSeaListingPrice;
    }
    if (openSeaListingPrice > openSeaFloorPrice)
        openSeaListingPrice = (openSeaListingPrice - 0.000001).toFixed(6) * 1;
    else if (openSeaListingPrice <= openSeaFloorPrice)
        openSeaListingPrice = openSeaFloorPrice.toFixed(6) * 1;
    return { openSeaListingPrice, rarityMultiplier };
}

export { getOpenSeaTraitBidAmount, getOpenSeaListingPrice };
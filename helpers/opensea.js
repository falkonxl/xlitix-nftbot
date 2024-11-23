import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "./logger.js";
import { getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings, submitOpenSeaOffer, getOpenSeaCollection } from "../apis/openseaapi.js";
import ERC20ABI from "../tokens/ERC20ABI.js";

// This example provider won't let you make transactions, only read-only calls:
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

const openseaSDK = new OpenSeaSDK(wallet, {
    chain: Chain.Mainnet,
    apiKey: process.env.OPENSEA_API_KEY,
});

async function getWETHBalance() {
    const contract = new ethers.Contract(process.env.WETH_CONTRACT_ADDRESS, ERC20ABI, provider);
    const balance = await contract.balanceOf(process.env.WALLET_ADDRESS);
    return balance.toString() / 1000000000000000000;
}

async function getOpenSeaTraitBidAmount(collectionData, traitRarityPercentile) {
    if (collectionData.opensea?.rankingPercentile?.oneToTen?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to <= 10) {
        logger("WARN", "OPENSEA SKIP BID", `{0-10} Skipping ${collectionData.slug} because not enough bid sales history in the zero to ten percentile.`);
        return;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAcceptedBidSales < 5 && traitRarityPercentile.to > 10) {
        logger("WARN", "OPENSEA SKIP BID", `{10-50} Skipping ${collectionData.slug} because not enough bid sales history in the ten to fifty percentile.`);
        return;
    }
    let collection = await getOpenSeaCollection(collectionData.slug);
    if (collection?.traitOffersEnabled == false) {
        logger("WARN", "OPENSEA SKIP BID", `Skipping ${collectionData.slug} because trait offers are not enabled.`);
        return;
    }
    let bidAmount = 0;
    let collectionOpenSeaData = await getOpenSeaCollectionStats(collectionData.slug);
    if (collectionOpenSeaData?.total?.floor_price == null || collectionOpenSeaData?.total?.floor_price * 1 <= 0)
        return;
    let openSeaFloorPrice = collectionOpenSeaData?.total?.floor_price * 1;
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
        let floorPriceMultiplier = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio
        if (bidAmount > (floorPriceMultiplier * openSeaFloorPrice).toFixed(4))
            logger("WARN", "OPENSEA BID ALERT", `{0-10} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(floorPriceMultiplier * openSeaFloorPrice).toFixed(4)}}.`);
        else if (bidAmount < (floorPriceMultiplier * openSeaFloorPrice).toFixed(4))
            logger("WARN", "OPENSEA BID ALERT", `{0-10} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(floorPriceMultiplier * openSeaFloorPrice).toFixed(4)}}.`);
        if (bidAmount * 1.05 > floorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{0-10} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    else if (traitRarityPercentile.to > 10) {
        bidAmount = bidAmount.toFixed(4) * 1 + 0.0005;
        // check to see if the bid amount is higher than the 7 day average floor price to protect against price spikes
        if (bidAmount > collectionData.opensea.sevenDayAverageDailyAverageFloorPrice)
            bidAmount = collectionData.opensea.sevenDayAverageDailyAverageFloorPrice.toFixed(4) * 1;
        let floorPriceMultiplier = collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio;
        if (bidAmount > (floorPriceMultiplier * openSeaFloorPrice).toFixed(4))
            logger("WARN", "OPENSEA BID ALERT", `{10-50} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(floorPriceMultiplier * openSeaFloorPrice).toFixed(4)}}.`);
        else if (bidAmount < (floorPriceMultiplier * openSeaFloorPrice).toFixed(4))
            logger("WARN", "OPENSEA BID ALERT", `{10-50} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(floorPriceMultiplier * openSeaFloorPrice).toFixed(4)}}.`);
        if (bidAmount * 1.05 > floorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{10-50} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    return bidAmount.toFixed(4) * 1;
}

async function submitOpenSeaTraitBids(collectionData, rarityRankPercentile, wethBalance) {
    let biddingTraits = collectionData.attributes.filter(a => a.rarityPercentFloor <= rarityRankPercentile.to && a.rarityPercentFloor > rarityRankPercentile.from && a.rarityPercentFloor > 0 && a.value != "" && a.count == a.countVerification && a.count / collectionData.totalSupply <= .5);
    if (biddingTraits.length == 0) {
        logger("WARN", "OPENSEA SKIP BID", `Skipping bid for ${collectionData.slug} because no valid traits found.`);
        return;
    }
    let bidAmount = await getOpenSeaTraitBidAmount(collectionData, rarityRankPercentile);
    if (bidAmount == null || bidAmount == 0)
        return;
    else {
        // if bid amount is higher that balance then skip bidding
        if (bidAmount > wethBalance) {
            logger("WARN", "OPENSEA SKIP BID", `Skipping bid for ${collectionData.slug} because bid amount is higher than balance {${bidAmount} > ${wethBalance.toFixed(2)}}.`);
            return;
        }
    }
    for (let i = 0; i < biddingTraits.length; i++) {
        let trait = biddingTraits[i];
        await submitOpenSeaOffer(collectionData.slug, bidAmount, 1, trait);
    }
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
        openSeaListingPrice = (collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * openSeaListingPrice;
    else if (rarityRankPercentile <= .25)
        openSeaListingPrice = (collectionData.opensea.rankingPercentile.tenToTwentyFive.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToTwentyFive.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToTwentyFive.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * openSeaListingPrice;
    else if (rarityRankPercentile <= .5)
        openSeaListingPrice = (collectionData.opensea.rankingPercentile.twentyFiveToFifty.thirtyDayAdjustedListingSales < 5 ?
            (collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
                collectionData.opensea.rankingPercentile.twentyFiveToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
                collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio
            ) :
            collectionData.opensea.rankingPercentile.twentyFiveToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * openSeaListingPrice;
    openSeaListingPrice = openSeaListingPrice.toFixed(6) * 1;
    if (openSeaListingPrice == 0)
        return;
    if (openSeaListingPrice < openSeaFloorPrice)
        openSeaListingPrice = openSeaFloorPrice.toFixed(6) * 1;
    let openSeaListings = await getOpenSeaListings(collectionData.slug);
    if (openSeaListings == null || openSeaListings.listings == null || openSeaListings.listings.length == 0)
        return { openSeaListingPrice, rarityMultiplier };
    let sorted = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
        (a, b) => ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
    );
    let nextHigherPriceOpenSeaListing = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
        (a, b) => ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
    )[0];
    if (nextHigherPriceOpenSeaListing != null) {
        openSeaListingPrice = ((nextHigherPriceOpenSeaListing.price.current.value / nextHigherPriceOpenSeaListing.protocol_data.parameters.offer[0].startAmount) / 1e18).toFixed(6) * 1;
        // get the next higher priced token and if the price difference is less than 3% then set the price to the next higher price
        nextHigherPriceOpenSeaListing = openSeaListings.listings.filter(l => l.price.current.currency.toLowerCase() == 'eth' && l.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase() && l.protocol_data.parameters.consideration[l.protocol_data.parameters.totalOriginalConsiderationItems - 1].token.toLowerCase() == '0x0000000000000000000000000000000000000000' && ((l.price.current.value / l.protocol_data.parameters.offer[0].startAmount) / 1e18) > openSeaListingPrice).sort(
            (a, b) => ((a.price.current.value / a.protocol_data.parameters.offer[0].startAmount) - (b.price.current.value / b.protocol_data.parameters.offer[0].startAmount))
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

export { getOpenSeaTraitBidAmount, getOpenSeaListingPrice, submitOpenSeaTraitBids, getWETHBalance };
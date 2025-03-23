import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "./logger.js";
import { getOpenSeaCollectionStats, getOpenSeaCollectionOffers, getOpenSeaListings, submitOpenSeaOffer, getOpenSeaCollection, createOpenSeaCollectionOffer, submitOpenSeaCollectionOffer } from "../apis/openseaapi.js";
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

function getOpenSeaRounding(bidAmount) {
    if (bidAmount < 0.1)
        return { increment: 0.0001, digits: 4 };
    else if (bidAmount < 1.0)
        return { increment: 0.003, digits: 3 };
    else
        return { increment: 0.05, digits: 2 };
}

async function getOpenSeaTraitBidAmount(collectionData, traitRarityPercentile) {
    if (collectionData.opensea?.rankingPercentile?.oneToTen?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to <= 10) {
        logger("WARN", "OPENSEA SKIP BID", `{0-10} Skipping ${collectionData.slug} because not enough bid sales history in the zero to ten percentile.`);
        return;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to > 10) {
        logger("WARN", "OPENSEA SKIP BID", `{10-50} Skipping ${collectionData.slug} because not enough bid sales history in the ten to fifty percentile.`);
        return;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio > 1.5 && traitRarityPercentile.to > 10) {
        logger("WARN", "SKIP BID", `Skipping ${collectionData.slug} because listing sale to floor price ratio is abnormally high.`);
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
        let rounding = getOpenSeaRounding(bidAmount);
        bidAmount = bidAmount.toFixed(rounding.digits) * 1 + rounding.increment;
        rounding = getOpenSeaRounding(bidAmount); // recalculate rounding based on new bid amount after increment
        bidAmount = bidAmount.toFixed(rounding.digits) * 1;
        let listingFloorPriceMultiplier = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio
        let bidFloorPriceMultiplier = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageAcceptedBidSalePriceToFloorPriceRatio;
        if (bidAmount > (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        else if (bidAmount < (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        if (bidAmount * 1.05 > listingFloorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    else if (traitRarityPercentile.to > 10) {
        let rounding = getOpenSeaRounding(bidAmount);
        bidAmount = bidAmount.toFixed(rounding.digits) * 1 + rounding.increment;
        rounding = getOpenSeaRounding(bidAmount); // recalculate rounding based on new bid amount after increment
        bidAmount = bidAmount.toFixed(rounding.digits) * 1;
        // check to see if the bid amount is higher than the 7 day average floor price to protect against price spikes
        if (bidAmount > collectionData.opensea.sevenDayMedianDailyAverageFloorPrice) {
            rounding = getOpenSeaRounding(collectionData.opensea.sevenDayMedianDailyAverageFloorPrice);
            bidAmount = collectionData.opensea.sevenDayMedianDailyAverageFloorPrice.toFixed(rounding.digits) * 1;
        }
        let listingFloorPriceMultiplier = collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio;
        let bidFloorPriceMultiplier = collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageAcceptedBidSalePriceToFloorPriceRatio;
        if (bidAmount > (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        else if (bidAmount < (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        if (bidAmount * 1.05 > listingFloorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    let rounding = getOpenSeaRounding(bidAmount); // recalculate rounding based on new bid amount after increment
    return bidAmount.toFixed(rounding.digits) * 1;
}

async function submitOpenSeaTraitBids(collectionData, rarityRankPercentile, wethBalance) {
    let biddingTraits = collectionData.attributes
        .filter(a =>
        ((a.opensea?.rarityPercentFloor <= rarityRankPercentile.to &&
            a.opensea?.rarityPercentFloor > rarityRankPercentile.from) ||
            (a.opensea?.thirtyDayAverageListingSalePriceToFloorPriceRatio > 1.1 &&
                a.opensea?.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio < 1.0 &&
                a.opensea?.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio > 0 &&
                rarityRankPercentile.from > 10)
        ) &&
        a.opensea?.rarityPercentFloor > 0 &&
        a.opensea?.count > 0 &&
        a.opensea?.value?.trim() !== "" &&
        a.opensea?.count === a.opensea?.countVerification &&
        a.opensea?.count / collectionData.totalSupply <= 0.5 &&
        ((a.blur?.rarityPercentFloor <= rarityRankPercentile.to &&
            a.blur?.rarityPercentFloor > rarityRankPercentile.from) ||
            (a.blur?.thirtyDayAverageListingSalePriceToFloorPriceRatio > 1.1 &&
                a.blur?.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio < 1.0 &&
                a.blur?.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio > 0 &&
                rarityRankPercentile.from > 10)
        ) &&
        a.blur?.rarityPercentFloor > 0 &&
        a.blur?.count > 0 &&
        a.blur?.value?.trim() !== "" &&
        a.blur?.count === a.blur?.countVerification &&
        a.blur?.count / collectionData.totalSupply <= 0.5
    )
    .filter(a =>
            collectionData.attributes.filter(t =>
                t.value?.toLowerCase() === a.value?.toLowerCase() &&
                t.key?.toLowerCase() === a.key?.toLowerCase()
            ).length == 1
        );
    if (biddingTraits.length == 0) {
        logger("WARN", "OPENSEA SKIP BID", `{${rarityRankPercentile.from},${rarityRankPercentile.to}} Skipping bid for ${collectionData.slug} because no valid traits found.`);
        return;
    }
    // get the total number of tokens with rarity from and to
    let totalTokensWithRarity = biddingTraits.reduce((a, b) => a + b.opensea.count, 0);
    let totalTokensWithRarityToSupplyRatio = totalTokensWithRarity / collectionData.totalSupply;
    if (totalTokensWithRarityToSupplyRatio > .3) {
        logger("WARN", "OPENSEA SKIP BID", `{${rarityRankPercentile.from},${rarityRankPercentile.to}} Skipping bid for ${collectionData.slug} because more than 50% of the tokens are in rarity range.`);
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
    let batchSize = 50;
    for (let i = 0; i < biddingTraits.length; i += batchSize) {
        const batch = biddingTraits.slice(i, i + batchSize);
        await Promise.all(batch.map(async (trait) => {
            const traits = [];
            traits.push({ key: trait.key, value: trait.value });
            const offer = await createOpenSeaCollectionOffer(collectionData.slug, bidAmount, 1, traits);
            if (offer == null || offer.httperror != null) {
                logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug}`);
                return;
            }
            if (offer.errors != null)
                for (let i = 0; i < offer.errors.length; i++) {
                    logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug} (${trait.key}:${trait.value}) for ${bidAmount} ETH. Error: ${offer.errors[i].message}`);
                }
            if (offer.actions != null && offer.actions.length == 1) {
                const signatureRequest = JSON.parse(offer.actions[0].signatureRequest.message);
                const signature = await wallet.signTypedData(signatureRequest.domain, signatureRequest.types, signatureRequest.message)
                const submission = await submitOpenSeaCollectionOffer(collectionData.slug, traits, offer.actions[0].order, signature);
                if (submission?.errorsV2 != null)
                    logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug} (${trait.key}:${trait.value}) for ${bidAmount} ETH.}`);
            }
        }));
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
    if (collectionData?.opensea?.sevenDayMedianDailyAverageFloorPrice > 0)
        openSeaListingPrice = collectionData.opensea.sevenDayMedianDailyAverageFloorPrice.toFixed(6) * 1;
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
    // bid sales are higher than listing sales by 50% and rarity percentile is greater than 10% then set the list price to the floor price
    if (rarityRankPercentile > .25 && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales) > 1.75)
        openSeaListingPrice = openSeaFloorPrice;
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
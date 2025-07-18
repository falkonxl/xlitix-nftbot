import { ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import logger from "./logger.js";
import { getOpenSeaCollectionOffers, getOpenSeaListings, getOpenSeaCollection, createOpenSeaCollectionOffer, submitOpenSeaCollectionOffer } from "../apis/openseaapi.js";
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
    let emptyReturnOject = { bidAmount: null, projectedListingPrice: null, projectedBidAmount: null };
    if (collectionData.opensea?.rankingPercentile?.oneToTen?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to <= 10) {
        logger("WARN", "OPENSEA SKIP BID", `{0-10} Skipping ${collectionData.slug} because not enough bid sales history in the zero to ten percentile.`);
        return emptyReturnOject;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to > 10) {
        logger("WARN", "OPENSEA SKIP BID", `{10-50} Skipping ${collectionData.slug} because not enough bid sales history in the ten to fifty percentile.`);
        return emptyReturnOject;
    }
    if (collectionData.opensea?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio > 1.5 && traitRarityPercentile.to > 10) {
        logger("WARN", "SKIP BID", `Skipping ${collectionData.slug} because listing sale to floor price ratio is abnormally high.`);
        return emptyReturnOject;
    }
    let collection = await getOpenSeaCollection(collectionData.slug);
    if (collection?.traitOffersEnabled == false) {
        logger("WARN", "OPENSEA SKIP BID", `Skipping ${collectionData.slug} because trait offers are not enabled.`);
        return emptyReturnOject;
    }
    let bidAmount = 0;
    if (collection?.floorPrice?.pricePerItem?.native?.unit == null || collection?.floorPrice?.pricePerItem?.native?.symbol == null || collection?.floorPrice?.pricePerItem?.native?.value * 1 <= 0 || collection?.floorPrice?.pricePerItem?.native?.symbol != "ETH")
        return emptyReturnOject;
    let openSeaFloorPrice = collection?.floorPrice?.pricePerItem?.native?.unit * 1;
    let openseaCollectionOffers = await getOpenSeaCollectionOffers(collectionData.slug);
    if (openseaCollectionOffers == null || openseaCollectionOffers.offers == null || openseaCollectionOffers.offers.length == 0)
        return emptyReturnOject;
    const openSeaTopOffer = openseaCollectionOffers.offers.filter(o => o.protocol_data.parameters.offer[0].token.toLowerCase() == process.env.WETH_CONTRACT_ADDRESS.toLowerCase() && o.protocol_data.parameters.offerer.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
        function (a, b) {
            return (b.protocol_data.parameters.offer[0].startAmount / b.protocol_data.parameters.consideration[0].startAmount) - (a.protocol_data.parameters.offer[0].startAmount / a.protocol_data.parameters.consideration[0].startAmount);
        }
    )[0];
    if (!openSeaTopOffer)
        return emptyReturnOject;
    let openSeaTopBidAmount = (openSeaTopOffer.protocol_data.parameters.offer[0].startAmount / openSeaTopOffer.protocol_data.parameters.consideration[0].startAmount) / 1e18;
    bidAmount = openSeaTopBidAmount;

    let listingFloorPriceMultiplier = 1;
    let bidFloorPriceMultiplier = 1;

    if (traitRarityPercentile.to <= 10) {
        let rounding = getOpenSeaRounding(bidAmount);
        bidAmount = bidAmount.toFixed(rounding.digits) * 1 + rounding.increment;
        rounding = getOpenSeaRounding(bidAmount); // recalculate rounding based on new bid amount after increment
        bidAmount = bidAmount.toFixed(rounding.digits) * 1;
        listingFloorPriceMultiplier = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio
        bidFloorPriceMultiplier = collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.oneToTen.thirtyDayAdjustedAverageAcceptedBidSalePriceToFloorPriceRatio;
        if (bidAmount > (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        else if (bidAmount < (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        if (bidAmount * 1.05 > listingFloorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return emptyReturnOject;
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
        listingFloorPriceMultiplier = collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio;
        bidFloorPriceMultiplier = collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio :
            collectionData.opensea.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageAcceptedBidSalePriceToFloorPriceRatio;
        if (bidAmount > (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        else if (bidAmount < (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1)
            logger("WARN", "OPENSEA BID ALERT", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits)}}.`);
        if (bidAmount * 1.05 > listingFloorPriceMultiplier * openSeaFloorPrice) {
            logger("WARN", "OPENSEA SKIP BID", `{${traitRarityPercentile.from}-${traitRarityPercentile.to}} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return emptyReturnOject;
        }
    }
    let rounding = getOpenSeaRounding(bidAmount); // recalculate rounding based on new bid amount after increment
    return { bidAmount: bidAmount.toFixed(rounding.digits) * 1, projectedListingPrice: (listingFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1, projectedBidAmount: (bidFloorPriceMultiplier * openSeaFloorPrice).toFixed(rounding.digits) * 1 };
}

async function submitOpenSeaTraitBids(collectionData, rarityRankPercentile, wethBalance, collectionTraitOffers) {
    let biddingTraits = collectionData.attributes
        .filter(a =>
        (((a.opensea?.rarityPercentFloor <= rarityRankPercentile.to &&
            a.opensea?.rarityPercentFloor > rarityRankPercentile.from)
        ) &&
            a.opensea?.rarityPercentFloor > 0 &&
            a.opensea?.count > 0 &&
            a.opensea?.value?.trim() !== "" &&
            a.opensea?.count === a.opensea?.countVerification &&
            a.opensea?.count / collectionData.totalSupply <= 0.5)
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
    let { bidAmount, projectedListingPrice, projectedBidAmount } = await getOpenSeaTraitBidAmount(collectionData, rarityRankPercentile);
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
        logger("LOG", "OPENSEA BIDDING AGENT", `Submitting bids for ${collectionData.slug} (${rarityRankPercentile.from}-${rarityRankPercentile.to}) for ${batch.length} traits...`);
        await Promise.all(batch.map(async (trait) => {
            try {
                let traitBidAmount = bidAmount;
                if (collectionTraitOffers?.traitOffers != null && collectionTraitOffers?.traitOffers.length > 0) {
                    let traitOffer = collectionTraitOffers?.traitOffers.filter(o => o.traitType.toLowerCase() == trait.key.toLowerCase() && o.traitValue.toLowerCase() == trait.value.toLowerCase())[0];
                    if (traitOffer != null) {
                        if (traitOffer.offerPrice?.token?.contractAddress?.toLowerCase() == process.env.WETH_CONTRACT_ADDRESS.toLowerCase()) {
                            let rounding = getOpenSeaRounding(traitOffer.offerPrice?.token?.unit);
                            let newBidAmount = traitOffer.offerPrice?.token?.unit.toFixed(rounding.digits) * 1;
                            if (newBidAmount <= projectedBidAmount.toFixed(rounding.digits) * 1 && newBidAmount * 1.05 < projectedListingPrice && newBidAmount > traitBidAmount && newBidAmount <= collectionData.opensea.sevenDayMedianDailyAverageFloorPrice)
                                traitBidAmount = newBidAmount;
                        }
                    }
                }
                const traits = [];
                traits.push({ key: trait.key, value: trait.value });
                const offer = await createOpenSeaCollectionOffer(collectionData.slug, traitBidAmount, 1, traits);
                if (offer == null || offer.httperror != null) {
                    logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug}`);
                    return;
                }
                if (offer.errors != null)
                    for (let i = 0; i < offer.errors.length; i++) {
                        logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug} (${trait.key}:${trait.value}) for ${traitBidAmount} ETH. Error: ${offer.errors[i].message}`);
                    }
                if (offer.actions != null && offer.actions.length == 1) {
                    const signatureRequest = JSON.parse(offer.actions[0].signatureRequest.message);
                    const signature = await wallet.signTypedData(signatureRequest.domain, signatureRequest.types, signatureRequest.message)
                    const submission = await submitOpenSeaCollectionOffer(collectionData.slug, traits, offer.actions[0].order, signature);
                    if (submission?.errorsV2 != null)
                        logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug} (${trait.key}:${trait.value}) for ${traitBidAmount} ETH.}`);
                }
            }
            catch (error) {
                logger("ERROR", "OPENSEA BID ERROR", `Error submitting bid for ${collectionData.slug} (${trait.key}:${trait.value}) for ${bidAmount} ETH. ${error.message}`);
            }
        }));
        logger("LOG", "OPENSEA BIDDING AGENT", `Bids submitted for ${collectionData.slug} (${rarityRankPercentile.from}-${rarityRankPercentile.to}) for ${batch.length} traits.`);
    }
}

async function getOpenSeaListingPrice(collectionData, blurRarityRank, openSeaTokeRarityRank) {
    let rarityRank = openSeaTokeRarityRank;
    if (blurRarityRank > openSeaTokeRarityRank && collectionData.blur.sevenDayListingSales > 0)
        rarityRank = blurRarityRank;
    if (collectionData == null)
        return;
    if (collectionData.opensea.sevenDayListingSales == 0)
        return;
    let collectionOpenSeaData = await getOpenSeaCollection(collectionData.slug);
    if (collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.unit == null || collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.symbol == null || collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.value * 1 <= 0 || collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.symbol != "ETH")
        return emptyReturnOject;
    let openSeaListingPrice = collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.unit * 1;
    var openSeaFloorPrice = collectionOpenSeaData?.floorPrice?.pricePerItem?.native?.value * 1;
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
    if (rarityRankPercentile > .25 && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales - collectionData.blur.oneDayAcceptedBidSales - collectionData.opensea.oneDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales - collectionData.blur.oneDayListingSales - collectionData.opensea.oneDayListingSales) > 1.5)
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
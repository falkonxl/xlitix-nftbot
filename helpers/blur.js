import { submitBid, getBidFormat, getBlurCollection, getListedBlurTokens, getUserTokensFromBlur, getCollectionExecutableBidsFromBlur, getUserBlurBids, cancelBlurBid, getBlurAuthChallenge, getBlurAccessToken, getEvents, getListingFormat, submitListing } from "../apis/blurapi.js";
import { ethers } from "ethers";
import ERC20ABI from "../tokens/ERC20ABI.js";
import ERC721ABI from "../tokens/ERC721ABI.js";
import 'dotenv/config'
import logger from "./logger.js";


let blurAuthToken;
const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

async function getBlurTraitBidAmount(collectionData, traitRarityPercentile) {
    if (collectionData.blur?.rankingPercentile?.oneToTen?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to <= 10) {
        logger("WARN", "SKIP BID", `Skipping ${collectionData.slug} because not enough bid sales history in the zero to ten percentile.`);
        return;
    }
    if (collectionData.blur?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAcceptedBidSales < 3 && traitRarityPercentile.to > 10) {
        logger("WARN", "SKIP BID", `Skipping ${collectionData.slug} because not enough bid sales history in the ten to fifty percentile.`);
        return;
    }
    if (collectionData.blur?.rankingPercentile?.tenToFifty?.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio > 1.5 && traitRarityPercentile.to > 10) {
        logger("WARN", "SKIP BID", `Skipping ${collectionData.slug} because listing sale to floor price ratio is abnormally high.`);
        return;
    }
    let bidAmount = 0;
    let collectionBlurData = await getBlurCollection(collectionData.slug);
    if (collectionBlurData.collection.floorPrice == null || collectionBlurData.collection.floorPrice.amount * 1 <= 0)
        return;
    let blurFloorPrice = collectionBlurData.collection.floorPrice.amount * 1;
    let blurExecutableBids = await getCollectionExecutableBidsFromBlur(collectionData.slug);
    let blurTopBidAmount = 0;
    let blurTopBidCount = 0;
    let blurBidderCount = 0;
    if (blurExecutableBids.length > 0) {
        blurTopBidAmount = blurExecutableBids.sort((a, b) => b.price - a.price)[0].price * 1;
        blurTopBidCount = blurExecutableBids.sort((a, b) => b.price - a.price)[0].bidCount * 1;
        blurBidderCount = blurExecutableBids.sort((a, b) => b.price - a.price)[0].bidderCount * 1;
    }
    if (blurTopBidAmount == 0)
        return;
    bidAmount = blurTopBidAmount;
    if (traitRarityPercentile.to <= 10) {
        if (blurTopBidAmount + 0.01 <= collectionData.blur.sevenDayMedianDailyAverageFloorPrice
            && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales) < 1.2
            && blurFloorPrice * (collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
                collectionData.blur.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
                collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) > (blurTopBidAmount + 0.01) * 1.05)
            bidAmount = blurTopBidAmount + 0.01;
        if (bidAmount > (collectionData.blur.rankingPercentile.oneToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * blurFloorPrice).toFixed(2))
            logger("WARN", "BID ALERT", `{0-10} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${(collectionData.blur.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * blurFloorPrice).toFixed(2)}}.`);
        else if (bidAmount < (collectionData.blur.rankingPercentile.oneToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * blurFloorPrice).toFixed(2))
            logger("WARN", "BID ALERT", `{0-10} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${(collectionData.blur.rankingPercentile.zeroToTen.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * blurFloorPrice).toFixed(2)}}.`);
        if (bidAmount * 1.05 > (collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.blur.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * blurFloorPrice) {
            logger("WARN", "SKIP BID", `{0-10} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    else if (traitRarityPercentile.to > 10) {
        // check to see if the bid amount is higher than the 7 day average floor price to protect against price spikes
        if (bidAmount > collectionData.blur.sevenDayMedianDailyAverageFloorPrice)
            bidAmount = collectionData.blur.sevenDayMedianDailyAverageFloorPrice.toFixed(2) * 1;
        let projectedAcceptedBidAmount = (collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAverageAcceptedBidSalePriceToFloorPriceRatio * blurFloorPrice).toFixed(2) * 1;
        if (blurTopBidAmount >= bidAmount && blurTopBidAmount + 0.01 <= collectionData.blur.sevenDayMedianDailyAverageFloorPrice
            && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales) < 1.2
            && blurFloorPrice * (collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
                collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
                collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) > (blurTopBidAmount + 0.01) * 1.05
            && (blurTopBidAmount + 0.01) <= projectedAcceptedBidAmount && (blurTopBidAmount + 0.01) < blurFloorPrice && (blurTopBidAmount + 0.01) < collectionData.blur.oneDayAverageFloorPrice) {
            bidAmount = blurTopBidAmount + (blurBidderCount > 3 ? 0.01 : 0);
            logger("WARN", "INCREASE BID", `{10-50} Adjusting bid higher for ${collectionData.slug} because enough listing sales to justify higher bid.`);
        }
        if (blurTopBidAmount >= bidAmount && blurBidderCount < 5 && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales) > 1) {
            //bidAmount = blurTopBidAmount - 0.01;
            logger("WARN", "DECREASE BID", `{10-50} Adjusting bid lower for ${collectionData.slug} because bid sales are higher than listing sales and bid pool is not large enough.`);
        }
        if (bidAmount > projectedAcceptedBidAmount) {
            logger("WARN", "BID ALERT", `{10-50} Bid for ${collectionData.slug} is greater than the projected bid amount {${bidAmount} > ${projectedAcceptedBidAmount}}.`);
            //bidAmount = projectedAcceptedBidAmount;     
        }
        else if (bidAmount < projectedAcceptedBidAmount)
            logger("WARN", "BID ALERT", `{10-50} Bid for ${collectionData.slug} is less than the projected bid amount {${bidAmount} < ${projectedAcceptedBidAmount}}.`);
        if (bidAmount * 1.05 > (collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
            collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * blurFloorPrice) {
            logger("WARN", "SKIP BID", `{10-50} Skipping ${collectionData.slug} because bid amount is not profitable based the projected sale price.`);
            return;
        }
    }
    return bidAmount.toFixed(2) * 1;
}

async function getBlurListPrice(contractAddress, collectionData, rarityRank) {
    let collectionBlurData = await getBlurCollection(contractAddress);
    var blurListPrice = collectionBlurData.collection.floorPrice.amount * 1;
    var blurFloorPrice = collectionBlurData.collection.floorPrice.amount * 1;
    let rarityMultiplier = 1;
    let rarityRankPercentile = rarityRank / collectionBlurData.collection.totalSupply;
    if (collectionData?.blur?.sevenDayMedianDailyAverageFloorPrice > 0)
        blurListPrice = collectionData.blur.sevenDayMedianDailyAverageFloorPrice.toFixed(6) * 1;
    let blurExecutableBids = await getCollectionExecutableBidsFromBlur(collectionBlurData.collection.collectionSlug);
    let blurTopBidAmount = 0;
    if (blurExecutableBids.length > 0)
        blurTopBidAmount = blurExecutableBids.sort((a, b) => b.price - a.price)[0].price * 1;
    if (blurTopBidAmount != null && blurTopBidAmount > blurListPrice)
        blurListPrice = blurTopBidAmount.toFixed(6) * 1;
    if (rarityRankPercentile <= .01) {
        rarityMultiplier = 1.28
        blurListPrice = (blurListPrice * rarityMultiplier).toFixed(6) * 1;
    }
    else if (rarityRankPercentile <= .1 && collectionData.blur.rankingPercentile.oneToTen.thirtyDayListingSales >= 3)
        blurListPrice = (collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedListingSales < 3 ?
            collectionData.blur.rankingPercentile.oneToTen.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.blur.rankingPercentile.oneToTen.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * blurListPrice;
    else if (rarityRankPercentile <= .25 && collectionData.blur.rankingPercentile.tenToTwentyFive.thirtyDayListingSales >= 5)
        blurListPrice = (collectionData.blur.rankingPercentile.tenToTwentyFive.thirtyDayAdjustedListingSales < 5 ?
            collectionData.blur.rankingPercentile.tenToTwentyFive.thirtyDayAverageListingSalePriceToFloorPriceRatio :
            collectionData.blur.rankingPercentile.tenToTwentyFive.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * blurListPrice;
    else if (rarityRankPercentile <= .5) {
        if (collectionData.blur.rankingPercentile.twentyFiveToFifty.thirtyDayAdjustedListingSales < 5)
            blurListPrice = (collectionData.blur.rankingPercentile.twentyFiveToFifty.thirtyDayAdjustedListingSales < 5 ?
                (collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedListingSales < 5 ?
                    collectionData.blur.rankingPercentile.twentyFiveToFifty.thirtyDayAverageListingSalePriceToFloorPriceRatio :
                    collectionData.blur.rankingPercentile.tenToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio
                ) :
                collectionData.blur.rankingPercentile.twentyFiveToFifty.thirtyDayAdjustedAverageListingSalePriceToFloorPriceRatio) * blurListPrice;
    }
    // bid sales are higher than listing sales by 50% and rarity percentile is greater than 10% then set the list price to the floor price
    if (rarityRankPercentile > .25 && (collectionData.blur.sevenDayAcceptedBidSales + collectionData.opensea.sevenDayAcceptedBidSales) / (collectionData.blur.sevenDayListingSales + collectionData.opensea.sevenDayListingSales) > 1.5)
        blurListPrice = blurFloorPrice;
    blurListPrice = blurListPrice.toFixed(6) * 1;
    if (blurListPrice < blurFloorPrice)
        blurListPrice = blurFloorPrice.toFixed(6) * 1;
    let blurTokenListings = await getListedBlurTokens(collectionBlurData.collection.collectionSlug);
    if (blurTokenListings == null || blurTokenListings.tokens == null || blurTokenListings.tokens.length == 0)
        return { blurListPrice, rarityMultiplier };
    // a safeguard to prevent listing high rarity tokens at a lower price
    let cheapestBlurTokenHigherRarityListing = blurTokenListings.tokens.filter(o => o.rarityRank / collectionBlurData.collection.totalSupply <= rarityRankPercentile && o.price.unit.toLowerCase() == 'eth' && o.isSuspicious == false && o.owner.address.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
        (a, b) => a.price.amount - b.price.amount)[0];
    if (cheapestBlurTokenHigherRarityListing?.price?.amount * 1 > 0 && blurListPrice < cheapestBlurTokenHigherRarityListing?.price?.amount * .8)
        blurListPrice = cheapestBlurTokenHigherRarityListing.price.amount * .8;
    let nextHigherPriceBlurTokenListing = blurTokenListings.tokens.filter(o => o.price.unit.toLowerCase() == 'eth' && o.price.amount * 1 >= blurListPrice.toFixed(6) * 1 && o.isSuspicious == false && o.owner.address.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
        (a, b) => a.price.amount - b.price.amount)[0];
    if (nextHigherPriceBlurTokenListing != null) {
        blurListPrice = nextHigherPriceBlurTokenListing.price.amount * 1;
        // get the next higher priced token and if the price difference is less than 3% then set the price to the next higher price
        nextHigherPriceBlurTokenListing = blurTokenListings.tokens.filter(o => o.price.unit.toLowerCase() == 'eth' && o.price.amount * 1 > blurListPrice.toFixed(6) * 1 && o.isSuspicious == false && o.owner.address.toLowerCase() != process.env.WALLET_ADDRESS.toLowerCase()).sort(
            (a, b) => a.price.amount - b.price.amount)[0];
        if (nextHigherPriceBlurTokenListing != null && (blurListPrice / nextHigherPriceBlurTokenListing.price.amount) < .97)
            blurListPrice = nextHigherPriceBlurTokenListing.price.amount * 1;
    }
    if (blurListPrice > blurFloorPrice)
        blurListPrice = (blurListPrice - 0.000001).toFixed(6) * 1;
    else if (blurListPrice <= blurFloorPrice)
        blurListPrice = blurFloorPrice.toFixed(6) * 1;
    return { blurListPrice, rarityMultiplier };
}

async function submitBlurListings(contractAddress, tokenId, listPrice) {
    // check to see if the wallet address is approved for the contract
    const contract = new ethers.Contract(contractAddress, ERC721ABI, wallet);
    var isapproved = await contract.isApprovedForAll(process.env.WALLET_ADDRESS, process.env.BLUR_DELEGATE_CONTRACT_ADDRESS);
    if (!isapproved) {
        await contract.setApprovalForAll(process.env.BLUR_DELEGATE_CONTRACT_ADDRESS, true);
        var starttimer = Math.floor(Date.now() / 1000);
        while (!isapproved) {
            await sleep(sleepinterval);
            isapproved = await contract.isApprovedForAll(process.env.WALLET_ADDRESS, process.env.BLUR_DELEGATE_CONTRACT_ADDRESS);
            if (Math.floor(Date.now() / 1000) > starttimer + 240)
                return false;
        }
    }
    // create a BLUR listing
    const today = (new Date((new Date).getTime() + 1600000)).toISOString();
    let listing = {
        "price": {
            "amount": listPrice.toFixed(6),
            "unit": "ETH"
        },
        "tokenId": tokenId,
        "feeRate": 0,
        "contractAddress": contractAddress.toLowerCase(),
        "expirationTime": (new Date((new Date).getTime() + (process.env.LISTING_DURATION_IN_MINUTES * 6e4))).toISOString()
    };
    let listingFormat = await getListingFormat(listing, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    if (listingFormat.error != null) {
        if (listingFormat.message == "0.5% minimum royalty for this collection") {
            listing.feeRate = 50;
            listingFormat = await getListingFormat(listing, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
        }
        else if (listingFormat.message)
            console.error(listingFormat.message);
    }
    if (listingFormat.signatures == null || listingFormat.signatures.length == 0)
        return false;
    // adjust nonce to 0, error in the BLUR API
    listingFormat.signatures[0].signData.value.nonce = 0;
    // submit the listing to BLUR
    const listingSubmission = await submitListing(
        {
            marketplace: listingFormat.signatures[0].marketplace,
            marketplaceData: listingFormat.signatures[0].marketplaceData,
            signature: await wallet.signTypedData(listingFormat.signatures[0].signData.domain, listingFormat.signatures[0].signData.types, listingFormat.signatures[0].signData.value)
        },
        await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    if (listingSubmission?.success == true)
        return true;
}

async function getUserTokens() {
    var userTokens = await getUserTokensFromBlur(process.env.WALLET_ADDRESS, null, true, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    return userTokens;
}

async function getUserBids() {
    var currentBidsOnBlur = await getUserBlurBids(process.env.WALLET_ADDRESS, "TRAIT", await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    return currentBidsOnBlur;
}

async function getBlurAuthToken() {
    if (blurAuthToken == null) {
        const authChallenge = await getBlurAuthChallenge(process.env.WALLET_ADDRESS);
        const signature = await wallet.signMessage(authChallenge.message);
        authChallenge.signature = signature;
        const accessToken = await getBlurAccessToken(authChallenge);
        blurAuthToken = accessToken.accessToken;
    }
    return blurAuthToken;
}

async function getBETHBalance() {
    const contract = new ethers.Contract("0x0000000000A39bb272e79075ade125fd351887Ac", ERC20ABI, provider);
    const balance = await contract.balanceOf(process.env.WALLET_ADDRESS);
    return balance.toString() / 1000000000000000000;
}

async function removeBlurBidsForNoLongerQualifiedCollections(collections, userBids) {
    for (let i = 0; i < userBids.length; i++) {
        let bid = userBids[i];
        let collection = collections.filter(c => c.contractAddress == bid.contractAddress)[0];
        if (collection == null) {
            await cancelBlurBid(bid.contractAddress, { type: bid.criteriaType, value: bid.criteriaValue }, bid.price, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
        }
    }
}

async function cancelCollectionTraitBids(collection, userBids) {
    for (let i = 0; i < userBids.length; i++) {
        let bid = userBids[i];
        if (bid.criteriaType == "TRAIT") {
            await cancelBlurBid(collection.contractAddress, { type: bid.criteriaType, value: bid.criteriaValue }, bid.price, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
        }
    }
}

async function submitBlurTraitBids(collectionData, bids, rarityRankPercentile) {
    let bethBalance = await getBETHBalance();
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
        logger("WARN", "SKIP BID", `{${rarityRankPercentile.from},${rarityRankPercentile.to}} Skipping bid for ${collectionData.slug} because no valid traits found.`);
        return;
    }
    if (biddingTraits.length * 2 > collectionData.attributes.filter(a => a.blur?.count > 0).length) {
        logger("WARN", "SKIP BID", `{${rarityRankPercentile.from},${rarityRankPercentile.to}} Skipping bid for ${collectionData.slug} because more than 50% of the traits are being bid on.`);
        return;
    }
    // get the total number of tokens with rarity from and to
    let totalTokensWithRarity = biddingTraits.reduce((a, b) => a + b.blur.count, 0);
    let totalTokensWithRarityToSupplyRatio = totalTokensWithRarity / collectionData.totalSupply;
    if (totalTokensWithRarityToSupplyRatio > .3) {
        logger("WARN", "SKIP BID", `{${rarityRankPercentile.from},${rarityRankPercentile.to}} Skipping bid for ${collectionData.slug} because more than 50% of the tokens are in rarity range.`);
        return;
    }
    let bidAmount = await getBlurTraitBidAmount(collectionData, rarityRankPercentile);
    if (bidAmount == null || bidAmount == 0) {
        // cancel all bids for this collection
        for (let i = 0; i < biddingTraits.length; i++) {
            let trait = biddingTraits[i];
            let traitBids = bids.filter(b => b.criteriaType == "TRAIT" && b.criteriaValue[trait.key] == trait.value);
            for (let i = 0; i < traitBids.length; i++) {
                await cancelBlurBid(collectionData.contractAddress, { type: traitBids[i].criteriaType, value: traitBids[i].criteriaValue }, (traitBids[i].price * 1), await getBlurAuthToken(), process.env.WALLET_ADDRESS);
                logger("WARN", "CANCEL BID", `Cancelling trait bid [${trait.key}:${trait.value}] of ${traitBids[i].price} ETH for ${collectionData.slug} because no valid bid amount generated.`);
            }
        }
        return;
    }
    else {
        // cancle trait bids that are not the current bid amount
        for (let i = 0; i < biddingTraits.length; i++) {
            let trait = biddingTraits[i];
            let traitBids = bids.filter(b => b.criteriaType == "TRAIT" && b.criteriaValue[trait.key] == trait.value && (b.price * 1) != bidAmount);
            for (let i = 0; i < traitBids.length; i++) {
                await cancelBlurBid(collectionData.contractAddress, { type: traitBids[i].criteriaType, value: traitBids[i].criteriaValue }, (traitBids[i].price * 1), await getBlurAuthToken(), process.env.WALLET_ADDRESS);
                logger("WARN", "CANCEL BID", `Cancelling trait bid [${trait.key}:${trait.value}] of ${traitBids[i].price} ETH for ${collectionData.slug} because bid amount has changed {${traitBids[i].price} -> ${bidAmount} ETH}.`);
            }
        }
        // if bid amount is higher that balance then skip bidding
        if (bidAmount > bethBalance) {
            logger("WARN", "SKIP BID", `Skipping bid for ${collectionData.slug} because bid amount is higher than balance {${bidAmount} > ${bethBalance.toFixed(2)}}.`);
            return;
        }
    }
    for (let i = 0; i < biddingTraits.length; i++) {
        let response;
        let trait = biddingTraits[i];
        let currentBid = null;
        let traitBids = bids.filter(b => b.criteriaType == "TRAIT" && b.criteriaValue[trait.key] == trait.value);
        if (traitBids.length > 0)
            currentBid = traitBids.filter(b => b.price == bidAmount)[0];
        const criteria = { type: "TRAIT", value: { [trait.key]: trait.value } };
        // determine the maximum number of bids to place
        let bidAmountMultiplier = 1.0;
        if (biddingTraits.length > 100)
            bidAmountMultiplier = 2.0;
        let bidQty = Math.floor(bethBalance / (bidAmount * bidAmountMultiplier));
        if (bidQty > process.env.MAX_NUMBER_OF_BIDS)
            bidQty = process.env.MAX_NUMBER_OF_BIDS * 1;
        if (bidQty == 0)
            bidQty = 1;
        if (currentBid == null) {
            response = await createBlurBid(collectionData, criteria, bidAmount, bidQty);
            if (response == true)
                logger("INFO", "PLACE BID", `Placing a new trait bid {"${trait.key}":"${trait.value}"} of ${bidAmount} ETH with quantity ${bidQty} (using multiplier of ${bidAmountMultiplier}) for ${collectionData.slug}.`);
        }
        else if (currentBid != null) {
            if ((currentBid.openSize ?? 1) > bidQty) {
                response = await cancelBlurBid(collectionData.contractAddress, { type: currentBid.criteriaType, value: currentBid.criteriaValue }, (currentBid.price * 1), await getBlurAuthToken(), process.env.WALLET_ADDRESS);
                if (response.success == true)
                    logger("WARN", "CANCEL BID", `Cancelling trait bid {"${trait.key}":"${trait.value}"} of ${currentBid.price} ETH for ${collectionData.slug} because bid qty doesn't match {${bidQty} -> ${currentBid.openSize ?? 1}}.`);
                response = await createBlurBid(collectionData, criteria, bidAmount, bidQty);
                if (response == true)
                    logger("INFO", "PLACE BID", `Placing a replacement bid qty of ${bidQty} (using multiplier of ${bidAmountMultiplier}) on a trait bid {"${trait.key}":"${trait.value}"} of ${bidAmount} ETH for ${collectionData.slug}.`);
            }
            else if ((currentBid.openSize ?? 1) < bidQty) {
                response = await createBlurBid(collectionData, criteria, bidAmount, bidQty - (currentBid.openSize ?? 1));
                if (response == true)
                    logger("INFO", "PLACE BID", `Adjusting bid qty by ${bidQty - (currentBid.openSize ?? 1)} (using multiplier of ${bidAmountMultiplier}) on a trait bid {"${trait.key}":"${trait.value}"} of ${bidAmount} ETH for ${collectionData.slug}.`);
            }
        }
        //if (error != null)
        //    if (error.message == 'Balance over-utilized') {
        //        logger("WARN", "STOP BID", `Stopping bid for ${collectionData.slug} because balance is over-utilized.`);
        //        break;
        //    }
    }
}

async function createBlurBid(collectionData, criteria, bidAmount, bidQty = 1) {
    let bid = {
        "contractAddress": collectionData.contractAddress,
        "price": {
            "unit": "BETH",
            "amount": `${bidAmount}`
        },
        "quantity": bidQty,
        "expirationTime": (new Date((new Date).getTime() + 8.64e7)).toISOString(),
        "criteria": criteria
    }
    let bidFormat = await getBidFormat(bid, await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    if (bidFormat == null || bidFormat.success == false || bidFormat.signatures == null || bidFormat.signatures.length == 0)
        return false;
    // adjust nonce to 0, error in the BLUR API
    bidFormat.signatures[0].signData.value.nonce = 0;
    const bidSubmission = await submitBid(
        {
            marketplaceData: bidFormat.signatures[0].marketplaceData,
            signature: await wallet.signTypedData(bidFormat.signatures[0].signData.domain, bidFormat.signatures[0].signData.types, bidFormat.signatures[0].signData.value)
        },
        await getBlurAuthToken(), process.env.WALLET_ADDRESS);
    if (bidSubmission?.success == true)
        return true;
    return false;
}

async function getTokenListingEvents(contractAddress, tokenId) {
    let tokenListingEvents = await getEvents(contractAddress, tokenId, false, false, false, true);
    if (tokenListingEvents == null || tokenListingEvents.activityItems == null)
        return;
    return tokenListingEvents.activityItems;
}

export { getBlurTraitBidAmount, getUserTokens, getBlurListPrice, getUserBids, submitBlurTraitBids, removeBlurBidsForNoLongerQualifiedCollections, getTokenListingEvents, submitBlurListings };
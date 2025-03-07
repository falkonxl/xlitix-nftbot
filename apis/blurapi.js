import sendHttpRequest from '../helpers/httprequest.js';
import { compareObjects } from '../helpers/utility.js';
import 'dotenv/config'

const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-RapidAPI-Key": process.env.RAPID_SHARE_BLURAPI_KEY
}
const sleepinterval = 1400;

async function getBlurAuthChallenge(walletAddress) {
    let payload = { walletAddress: walletAddress };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/auth/challenge`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getBlurAccessToken(signedAuthChallenge) {
    let payload = {
        message: signedAuthChallenge.message,
        walletAddress: signedAuthChallenge.walletAddress,
        expiresOn: signedAuthChallenge.expiresOn,
        hmac: signedAuthChallenge.hmac,
        signature: signedAuthChallenge.signature
    }
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/auth/login`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function cancelBlurBid(contractAddress, criteria, bidamount = 0, authToken, walletAddress) {
    let bidCancellation = { "contractAddress": contractAddress };
    if (criteria.type == "COLLECTION")
        bidCancellation.prices = [`${bidamount}`]
    else if (criteria.type == "TRAIT")
        bidCancellation.criteriaPrices = [{ price: `${[bidamount]}`, criteria: criteria }]
    let payload = {
        bidCancellation: bidCancellation,
        authToken: authToken,
        walletAddress: walletAddress
    }
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/bid/cancel`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getUserTokensFromBlur(userWalletAddress, contractAddress, hasAsks = false, authToken, walletAddress) {
    let userTokens = [];
    let nextCursor;
    let iterationCount = 0;
    while (true) {
        let payload = { userWalletAddress: userWalletAddress, authToken: authToken, walletAddress: walletAddress, contractAddress: contractAddress, hasAsks: hasAsks }
        if (nextCursor != null)
            payload.nextCursor = nextCursor;
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/user/tokens`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.httperror != null)
            return;
        else {
            if (response.tokens == null || response.tokens.length == 0)
                break;
            for (let i = 0; i < response.tokens.length; i++)
                userTokens = userTokens.concat(response.tokens[i]);
            nextCursor = response.nextCursor;
            if (response.tokens.length < 100)
                break;
        }
        iterationCount++;
        if (iterationCount > 10)
            break;
    }
    return userTokens;
}

async function getEvents(contractAddress, tokenId, showSales, showMints, showTransfers, showListingOrders) {
    let payload = { contractAddress: contractAddress, tokenId: tokenId, showSales: showSales, showMints: showMints, showTransfers: showTransfers, showListingOrders: showListingOrders };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/events`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getUserBlurBids(userWalletAddress, criteria, authToken, walletAddress) {
    let userBids = [];
    let nextCursor;
    let iterationCount = 0;
    let retrycount = 0;
    while (true) {
        let payload = { userWalletAddress: userWalletAddress, authToken: authToken, walletAddress: walletAddress, criteria: criteria }
        if (nextCursor != null)
            payload.nextCursor = nextCursor;
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/user/bids`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.httperror != null || response.statusCode == 401) {
            retrycount++;
            if (retrycount > 3)
                return { httperror: true };
            await sleep(sleepinterval);
            continue;
        }
        else {
            if (response.priceLevels == null || response.priceLevels.length == 0)
                break;
            for (let i = 0; i < response.priceLevels.length; i++)
                if (!userBids.find(x => x.price == response.priceLevels[i].price && x.criteriaType == response.priceLevels[i].criteriaType && compareObjects(x.criteriaValue, response.priceLevels[i].criteriaValue)))
                    userBids.push(response.priceLevels[i]);
            nextCursor = response.nextCursor;
            if (response.priceLevels.length < 100)
                break;
        }
        iterationCount++;
        if (iterationCount > 100)
            break;
        retrycount = 0; // reset retry count for the next iteration
    }
    return userBids;
}

async function getBlurCollection(slug) {
    let payload = { collection: slug };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/collection`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getListedBlurTokens(slug) {
    let payload = { collection: slug };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/collection/tokens/listed`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getCollectionExecutableBidsFromBlur(slug) {
    let payload = { collection: slug };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/collection/executable-bids`, "POST", headers, sleepinterval, 3, payload);
    if (response == null || response.httperror != null)
        return;
    else {
        if (response.success) {
            let collectionbids = [];
            for (let i = 0; i < response.priceLevels.length; i++)
                collectionbids.push({ price: response.priceLevels[i].price, bidCount: response.priceLevels[i].executableSize, bidderCount: response.priceLevels[i].numberBidders });
            return collectionbids;
        }
    }
    return;
}

async function getListingFormat(listing, authToken, walletAddress) {
    let payload = {
        listing: listing,
        walletAddress: walletAddress,
        authToken: authToken
    };
    let response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/listing/format`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function submitListing(listingSubmission, authToken, walletAddress) {
    let payload = {
        listingSubmission: listingSubmission,
        authToken: authToken,
        walletAddress: walletAddress
    }
    let response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/listing/submit`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function getBidFormat(bid, authToken, walletAddress) {
    let payload = {
        bid: bid,
        walletAddress: walletAddress,
        authToken: authToken
    };
    let response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/bid/format`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

async function submitBid(bidSubmission, authToken, walletAddress) {
    let payload = {
        bidSubmission: bidSubmission,
        authToken: authToken,
        walletAddress: walletAddress
    };
    let response = await sendHttpRequest(`${process.env.RAPID_SHARE_BLURAPI_URL}/bid/submit`, "POST", headers, sleepinterval, 3, payload);
    return response;
}

export { getBidFormat, submitBid, getListingFormat, submitListing, getBlurAuthChallenge, getBlurAccessToken, getUserBlurBids, cancelBlurBid, getBlurCollection, getListedBlurTokens, getCollectionExecutableBidsFromBlur, getUserTokensFromBlur, getEvents };
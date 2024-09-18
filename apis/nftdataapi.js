import sendHttpRequest from '../helpers/httprequest.js';
import 'dotenv/config'

const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-RapidAPI-Key": process.env.RAPID_SHARE_NFTDATAAPI_KEY
}
const sleepinterval = 1400;

async function getCollections() {
    let nextCursor;
    let collections = [];
    let iterationCount = 0;
    while (true) {
        let payload = {};
        if (nextCursor != null)
            payload.nextCursor = nextCursor;
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_NFTDATAAPI_URL}/collections/`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.httperror != null)
            break;
        else {
            collections = collections.concat(response.collections);
            nextCursor = response.nextCursor;
            if (nextCursor == null)
                break;
        }
        iterationCount++;
        if (iterationCount > 10)
            break;
    }
    return collections;
}

async function getCollection(slug) {
    let payload = { slug: slug };
    const response = await sendHttpRequest(`${process.env.RAPID_SHARE_NFTDATAAPI_URL}/collection`, "POST", headers, sleepinterval, 3, payload);
    if (response == null || response.httperror != null)
        return;
    else {
        return response;
    }
}

async function getCollectionAttributes(slug) {
    let nextCursor;
    let attributes = [];
    let attributesTotalCount = 0;
    let iterationCount = 0;
    while (true) {
        let payload = { slug: slug };
        if (nextCursor != null)
            payload.nextCursor = nextCursor;
        const response = await sendHttpRequest(`${process.env.RAPID_SHARE_NFTDATAAPI_URL}/collection/attributeranking`, "POST", headers, sleepinterval, 3, payload);
        if (response == null || response.httperror != null)
            break;
        else {
            attributes = attributes.concat(response.attributes);
            nextCursor = response.nextCursor;
            attributesTotalCount = response.attributesTotalCount;
            if (nextCursor == null || attributes.length == attributesTotalCount)
                break;
        }
        iterationCount++;
        if (iterationCount > 10)
            break;
    }
    return { attributes, attributesTotalCount };
}

export { getCollections, getCollection, getCollectionAttributes };
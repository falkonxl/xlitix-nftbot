import { getCollections, getCollection, getCollectionAttributes  } from '../apis/nftdataapi.js';
import logger from '../helpers/logger.js';

async function runCollectionAggregatorAgent(collections){
    logger("LOG", "COLLECTION AGGREGATOR AGENT", "Downloading collection data...");
    let c = await getCollections();
    //let c = [];
    //c.push((await getCollection("deadfellaz")).collection);
    for (let i = 0; i < c.length; i++)
        if(!collections.some(e => e.slug === c[i].slug)){
            let attributes = await getCollectionAttributes(c[i].slug);
            collections.push({...c[i], ...attributes, ...{ dateAddedToList: new Date(), dateLastUpdated: new Date()}});
        }
    logger("LOG", "COLLECTION AGGREGATOR AGENT", "Collection data download complete.");
    return collections;
}

async function runCollectionUpdaterAgent(collections){
    logger("LOG", "COLLECTION UPDATER AGENT", "Updating collection data...");
    for(let i = collections.length - 1; i >= 0; i--)
    {
        // if collection last updated more than 1 hours ago
        if(collections[i].dateLastUpdated < new Date() - 3600000)
        {
            try
            {
                if(collections[i].slug == null)
                    continue;
                let collection = await getCollection(collections[i].slug);
                let attributes = await getCollectionAttributes(collections[i].slug);
                if(collection == null || attributes == null || collection.collection == null)
                    continue;
                collections[i] = {...collection.collection, ...attributes, ...{ dateAddedToList: collections[i].dateAddedToList, dateLastUpdated: new Date()}};
            }
            catch(err)
            {
                console.error(`${new Date()}: Error saving collection data for ${collections[i].slug} \r\n ${err}`);
            }
        }
    }
    logger("LOG", "COLLECTION UPDATER AGENT", "Collection data update complete.");
    return collections;
}

export { runCollectionUpdaterAgent, runCollectionAggregatorAgent };
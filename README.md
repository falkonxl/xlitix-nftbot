# Fully-Automated NFT Bot for Blur & OpenSea Marketplaces

This Node.js app runs a fully-automated NFT bot that bids on the Blur marketplace and lists 
tokens on the Blur and OpenSea marketplaces. This code is dependent on [OpeaSea's official API](https://github.com/ProjectOpenSea/opensea-js), [RapidShare Unofficial Blur API](https://rapidapi.com/dmitriaa/api/blur-api5)
and [RapidShare NFT Data & Analtyics API](https://rapidapi.com/dmitriaa/api/nft-data-analytics-api). The RapidShare APIs require a paid subscription to the **Recommended** plan to have a sufficient amount of requests to 
run the bot.

You can run the bot locally with Visual Studio Code and Node.js v20.x or in the cloud in a Docker container running Node.js v20.x. You can also use this code as a starting point to create your own bot. 

To start the bot, I suggest to start with a new empty wallet and about 1ETH. A lower balance can be used but it is not optimal. Once you have some ETH in your wallet, you will need to add ETH to your pool balance on Blur for the bot to start bidding.
When you add ETH to your pool balance on Blur, Blur basically converts ETH to BETH. You use BETH to place bids on Blur. Initially, convert .3 ETH to BETH to start the bot, and then increase the amount as you become more familiar with how the bot
operates. The bot doesn't move any funds, so you need to monitor the pool balance and move funds as needed. It is not uncommon for the bot to use up all the funds to buy NFTs. Just wait till you sell your NFT's, then move ETH back to the pool balance.

## The Setup

Below is the .sample.env file that needs to be renamed to .env and modified with proper values.

```
RAPID_SHARE_BLURAPI_KEY=YOUR_RAPIDSHARE_KEY
RAPID_SHARE_BLURAPI_URL="https://blur-api5.p.rapidapi.com"
RAPID_SHARE_NFTDATAAPI_KEY=YOUR_RAPIDSHARE_KEY
RAPID_SHARE_NFTDATAAPI_URL="https://nft-data-analytics-api.p.rapidapi.com"
WALLET_ADDRESS=0x0000000000000000000000000000000000000000
WALLET_PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY
RPC_PROVIDER=RPC_PROVIDER
MAX_NUMBER_OF_BIDS=3
MAX_NUMBER_OF_DAYS_IN_WALLET=90
LISTING_DURATION_IN_MINUTES=20
LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES=2
BLUR_DELEGATE_CONTRACT_ADDRESS=0x2f18F339620a63e43f0839Eeb18D7de1e1Be4DfB
OPENSEA_API_KEY=YOUR_OPNESEA_API_KEY
```

### Properties Required to Change Prior to Bot Start

**RAPID_SHARE_BLURAPI_KEY & RAPID_SHARE_NFTDATAAPI_KEY** - A RapidShare key can be obtained by subscribing to a plan for [RapidShare Unofficial Blur API](https://rapidapi.com/dmitriaa/api/blur-api5) and [RapidShare NFT Data & Analtyics API](https://rapidapi.com/dmitriaa/api/nft-data-analytics-api). 
The key will likely be the same if you use the same RapidShare account for your subscriptions.

**WALLET_ADDRESS** - Your Ethereum wallet address. I strongly recommend to create a new wallet address. Do not use your existing wallet addresses. 

**WALLET_PRIVATE_KEY** - Your Ethereum wallet private key for the wallet address above. This app only uses your private key to sign requests where needed. If you decide to run this app in a hosted environmnet, make sure to protect your private key properly. Private key can be used to gain access to your wallet. Please look through the code, so you understand where and how your private key is used. Protecting your private key is your responsiblity.

**RPC_PROVIDER** - A URL for your choice of RPC provider. I use Infura. You can sign up and create an API key for free. Your url should look like this: https://mainnet.infura.io/v3/{YOUR_API_KEY}

**OPENSEA_API_KEY** - An OpenSea's API key can be obtained directly on [the OpenSea website](https://docs.opensea.io/reference/api-keys). 

### Properties To Change When Needed (Optimal Default Values Provided)

**MAX_NUMBER_OF_BIDS** - Defaults to 3. Set the max number of bids to place. This bot makes trait bids, and this number indicates the number of bids per trait. The Blur marketplace gives a higher priority to buyers with a larger quantity of bids, trait or collection, that qualify to buy a token 
when a seller is accepting a bid.

**MAX_NUMBER_OF_DAYS_IN_WALLET** - Defaults to 90. The bot will only try to list the tokens that have been in your wallet for less than 90 days.

**LISTING_DURATION_IN_MINUTES** - Defaults to 20. Set the number of minutes for the duration of the listings. The bot will re-list your tokens automatically.

**LISTING_MAX_OVERLAP_PERIOD_IN_MINUTES** - Defaults to 2. Set the number of minutes before the listing expiration when the bot should relist the token.

## How to Run The Bot

The fastest way to start running the bot, clone the repository to Visual Studio (VS) Code. Make sure you have Node.js v20.x installed. Run `node -v` in the VS Code terminal window to check your version of Node.js. 
Run `npm install` in the VS Code terminal window to install dependencies. Then run `node agentbot.js` to start the bot.

Here is a sample launch.json:

```
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "node",
            "request": "launch",
            "name": "Launch Program",
            "skipFiles": [
                "<node_internals>/**"
            ],
            "program": "${workspaceFolder}\\agentbot.js"
        }
    ]
}
```

The initial settings for picking collections to bid are provided. I run those settings and you can check [my trade history](https://blur.io/0x6A9fE486F1A2860ECF40d3f20BB9cC02d9C09E41/history).  You can modify those settings if/when you feel comfortable. The NFT Data and Analytics API provides a wide number of metrics to use, and you can figure out your winning strategy. Below is the snippet of code located in the agents/bidagents.js where the collections are selected for bidding.

```
// select collections to bid on
let selectedCollections = collections.filter(c => c.attributesTotalCount > 10 &&
(c.blur?.thirtyDayAverageDailyAverageFloorPrice / c.blur?.sevenDayAverageDailyAverageFloorPrice) > .75 &&
(c.blur?.sevenDayAverageDailyListingSales + c.opensea?.sevenDayAverageDailyListingSales) > 2 &&
c.blur?.sevenDayFloorPriceIncreases > 2 &&
c.blur?.sevenDayAverageDailyAverageFloorPrice > 0.03 &&
c.blur?.sevenDayAverageDailyAverageFloorPrice < .5);
```

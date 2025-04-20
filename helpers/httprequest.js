import fetch from "node-fetch";
import { isEmptyObject } from "./utility.js";
import logger from "./logger.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendHttpRequest(url, method, headers, sleepinterval, retrycount, payload) {
    var retrynumber = 0;
    while (true) {
        if (retrynumber >= retrycount){
            console.error(new Date() + ": Failed request (too many re-tries): " + url);
            return;
        }
        await sleep(sleepinterval);
        var options = {
            method: `${method}`,
            headers: headers,
            retry: retrycount,
            pause: sleepinterval,
            signal: AbortSignal.timeout(30000)
        };
        if (method.toLowerCase() == "post")
            options.body = JSON.stringify(payload);
        const response = await fetch(url, options).catch(() => {}); 
        if(response == null || response.status != 200)
        {
            if(response?.status == 400){
                logger("ERROR", "API ERROR", `BAD REQUEST [400]: ${url}`);
                return;
            }
            else if(response?.status == 429){
                logger("ERROR", "API ERROR", `RATE LIMITED [429]: ${url}`);
                await sleep(sleepinterval);
                retrynumber++;
                continue;
            }
            else{
                retrynumber ++;
                continue;
            }
        }
        const json = await response.json().catch(() => {});
        if (json == null || isEmptyObject(json))
        {
            logger("ERROR", "API ERROR", `INVALID JSON: ${url}`);
            retrynumber++;
            continue;
        }
        if(json.errors != null)
        {
            for(let i = 0; i < json.errors.length; i++)
            {
                if(json.errors[i].message == "Too Many Requests"){
                    //logger("ERROR", "API ERROR", `RATE LIMITED [429]: ${url}`);
                    await sleep(sleepinterval);
                    retrynumber++;
                    continue;
                }
            }
        }   
        if(json.statusCode == 401)
        {
            //logger("ERROR", "API ERROR", `UNAUTHORIZED ACCESS [401]: ${url}`);
            retrynumber++;
            continue;
        }
        return json;
    }
}

export default sendHttpRequest;
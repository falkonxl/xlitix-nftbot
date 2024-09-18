function logger(type, action, message) {
    const logMessage = `[${new Date().toISOString()}] [${action}] ${message}`;
    if(type == "ERROR")
        console.error(logMessage);
    else if(type == "WARN")
        console.warn(logMessage);
    else
        console.log(logMessage);    
}

export default logger;